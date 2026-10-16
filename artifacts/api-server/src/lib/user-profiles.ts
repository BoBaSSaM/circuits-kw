import { clerkClient } from "@clerk/express";
import { getMongoDatabase } from "./mongo";

export type DashboardRole = "customer" | "editor" | "admin";

export type UserProfileDocument = {
  _id: string;
  clerkUserId: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  primaryEmailVerified?: boolean;
  role?: DashboardRole;
  clerkCreatedAt: Date;
  clerkUpdatedAt: Date;
  lastSyncedAt: Date;
  createdAt: Date;
};

type ClerkUserResource = Awaited<ReturnType<typeof clerkClient.users.getUser>>;
type ClerkUserForProfile = Pick<
  ClerkUserResource,
  | "id"
  | "emailAddresses"
  | "primaryEmailAddressId"
  | "firstName"
  | "lastName"
  | "createdAt"
  | "updatedAt"
>;

export type ClerkWebhookUser = {
  id: string;
  emailAddresses: {
    id: string;
    emailAddress: string;
    verificationStatus?: string | null;
  }[];
  primaryEmailAddressId: string | null;
  firstName: string | null;
  lastName: string | null;
  createdAt: number;
  updatedAt: number;
};

function getBootstrapEmail(): string | null {
  const email = process.env.CIRCUITS_KW_BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  return email || null;
}

async function saveUserProfile(profileData: {
  id: string;
  email: string | null;
  emailVerified: boolean;
  firstName: string | null;
  lastName: string | null;
  createdAt: Date;
  updatedAt: Date;
}): Promise<UserProfileDocument> {
  const bootstrapEmail = getBootstrapEmail();
  const isBootstrapAdmin =
    Boolean(bootstrapEmail && profileData.emailVerified && profileData.email) &&
    profileData.email?.trim().toLowerCase() === bootstrapEmail;
  const now = new Date();
  const database = await getMongoDatabase();
  const users = database.collection<UserProfileDocument>("users");
  const fields = {
    clerkUserId: profileData.id,
    email: profileData.email,
    firstName: profileData.firstName,
    lastName: profileData.lastName,
    primaryEmailVerified: profileData.emailVerified,
    clerkCreatedAt: profileData.createdAt,
    clerkUpdatedAt: profileData.updatedAt,
    lastSyncedAt: now,
    createdAt: profileData.createdAt,
    ...(isBootstrapAdmin ? { role: "admin" as const } : {}),
  };

  await users.updateOne(
    { _id: profileData.id },
    {
      $set: fields,
      $setOnInsert: {
        ...(isBootstrapAdmin ? {} : { role: "customer" as const }),
      },
    },
    { upsert: true },
  );

  let profile = await users.findOne({ _id: profileData.id });
  if (!profile) {
    throw new Error("The profile was not available after synchronization.");
  }

  if (!profile.role) {
    const role: DashboardRole = isBootstrapAdmin ? "admin" : "customer";
    await users.updateOne({ _id: profileData.id }, { $set: { role } });
    profile = { ...profile, role };
  }

  return profile;
}

async function saveClerkUserProfile(user: ClerkUserForProfile): Promise<UserProfileDocument> {
  const primaryEmailAddress = user.emailAddresses.find(
    (address) => address.id === user.primaryEmailAddressId,
  );

  return saveUserProfile({
    id: user.id,
    email: primaryEmailAddress?.emailAddress ?? null,
    emailVerified: primaryEmailAddress?.verification?.status === "verified",
    firstName: user.firstName ?? null,
    lastName: user.lastName ?? null,
    createdAt: new Date(user.createdAt),
    updatedAt: new Date(user.updatedAt),
  });
}

export async function syncClerkUserProfile(userId: string): Promise<UserProfileDocument> {
  const user = await clerkClient.users.getUser(userId);
  return saveClerkUserProfile(user);
}

export async function syncClerkUserProfileFromWebhook(
  user: ClerkWebhookUser,
): Promise<UserProfileDocument> {
  const primaryEmailAddress = user.emailAddresses.find(
    (address) => address.id === user.primaryEmailAddressId,
  );

  return saveUserProfile({
    id: user.id,
    email: primaryEmailAddress?.emailAddress ?? null,
    emailVerified: primaryEmailAddress?.verificationStatus === "verified",
    firstName: user.firstName,
    lastName: user.lastName,
    createdAt: new Date(user.createdAt),
    updatedAt: new Date(user.updatedAt),
  });
}

export async function deleteClerkUserProfile(userId: string): Promise<void> {
  const database = await getMongoDatabase();
  await database.collection<UserProfileDocument>("users").deleteMany({
    $or: [{ _id: userId }, { clerkUserId: userId }],
  });
}

export type UserProfileBackfillResult = {
  succeededCount: number;
  failedCount: number;
  complete: boolean;
};

type UserProfileBackfillDependencies = {
  getUserList: (params: { limit: number; offset: number }) => Promise<{
    data: ClerkUserForProfile[];
    totalCount: number;
  }>;
  saveUserProfile: (user: ClerkUserForProfile) => Promise<unknown>;
};

export async function backfillClerkUserProfiles(
  dependencies: Partial<UserProfileBackfillDependencies> = {},
): Promise<UserProfileBackfillResult> {
  const getUserList =
    dependencies.getUserList ??
    ((params: { limit: number; offset: number }) => clerkClient.users.getUserList(params));
  const saveUserProfile = dependencies.saveUserProfile ?? saveClerkUserProfile;
  const pageSize = 100;
  let offset = 0;
  let totalCount = Number.POSITIVE_INFINITY;
  let succeededCount = 0;
  let failedCount = 0;
  let complete = true;

  while (offset < totalCount) {
    const expectedMoreUsers = Number.isFinite(totalCount) && offset < totalCount;
    let page: { data: ClerkUserForProfile[]; totalCount: number };
    try {
      page = await getUserList({ limit: pageSize, offset });
    } catch {
      complete = false;
      break;
    }

    totalCount = page.totalCount;
    if (!page.data.length) {
      if (expectedMoreUsers || offset < totalCount) {
        complete = false;
      }
      break;
    }

    const outcomes = await Promise.all(
      page.data.map(async (user) => {
        try {
          await saveUserProfile(user);
          return true;
        } catch {
          return false;
        }
      }),
    );
    const succeededOnPage = outcomes.filter(Boolean).length;
    succeededCount += succeededOnPage;
    failedCount += outcomes.length - succeededOnPage;

    if (page.data.length < pageSize && offset + page.data.length < totalCount) {
      complete = false;
      break;
    }

    offset += pageSize;
  }

  return { succeededCount, failedCount, complete };
}

export function getBackfillCommandExitCode(result: UserProfileBackfillResult): 0 | 1 {
  return result.complete && result.failedCount === 0 ? 0 : 1;
}

export async function getOrSyncUserProfile(userId: string): Promise<UserProfileDocument> {
  const database = await getMongoDatabase();
  const users = database.collection<UserProfileDocument>("users");
  let profile = await users.findOne({ _id: userId });
  const bootstrapEmail = getBootstrapEmail();
  const profileMatchesBootstrap =
    Boolean(bootstrapEmail && profile?.email) &&
    profile?.email?.trim().toLowerCase() === bootstrapEmail;

  if (
    !profile ||
    !profile.role ||
    !profile.lastSyncedAt ||
    (profileMatchesBootstrap && profile.primaryEmailVerified === undefined)
  ) {
    profile = await syncClerkUserProfile(userId);
  }

  if (
    profileMatchesBootstrap &&
    profile.primaryEmailVerified === true &&
    profile.role !== "admin"
  ) {
    await users.updateOne({ _id: userId }, { $set: { role: "admin" } });
    profile = { ...profile, role: "admin" };
  }

  return profile;
}

export function normalizeDashboardRole(role: DashboardRole | undefined): DashboardRole {
  return role ?? "customer";
}

export function isBootstrapAdmin(profile: UserProfileDocument): boolean {
  const bootstrapEmail = getBootstrapEmail();
  return Boolean(
    bootstrapEmail &&
      profile.primaryEmailVerified === true &&
      profile.email?.trim().toLowerCase() === bootstrapEmail,
  );
}
