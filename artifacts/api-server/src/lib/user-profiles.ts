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

function getBootstrapEmail(): string | null {
  const email = process.env.CIRCUITS_KW_BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  return email || null;
}

async function saveClerkUserProfile(user: ClerkUserResource): Promise<UserProfileDocument> {
  const primaryEmailAddress = user.emailAddresses.find(
    (address) => address.id === user.primaryEmailAddressId,
  );
  const email = primaryEmailAddress?.emailAddress ?? null;
  const emailVerified = primaryEmailAddress?.verification?.status === "verified";
  const bootstrapEmail = getBootstrapEmail();
  const isBootstrapAdmin =
    Boolean(bootstrapEmail && emailVerified && email) &&
    email?.trim().toLowerCase() === bootstrapEmail;
  const now = new Date();
  const database = await getMongoDatabase();
  const users = database.collection<UserProfileDocument>("users");
  const fields = {
    clerkUserId: user.id,
    email,
    firstName: user.firstName ?? null,
    lastName: user.lastName ?? null,
    primaryEmailVerified: emailVerified,
    clerkCreatedAt: new Date(user.createdAt),
    clerkUpdatedAt: new Date(user.updatedAt),
    lastSyncedAt: now,
    createdAt: new Date(user.createdAt),
    ...(isBootstrapAdmin ? { role: "admin" as const } : {}),
  };

  await users.updateOne(
    { _id: user.id },
    {
      $set: fields,
      $setOnInsert: {
        ...(isBootstrapAdmin ? {} : { role: "customer" as const }),
      },
    },
    { upsert: true },
  );

  let profile = await users.findOne({ _id: user.id });
  if (!profile) {
    throw new Error("The profile was not available after synchronization.");
  }

  if (!profile.role) {
    const role: DashboardRole = isBootstrapAdmin ? "admin" : "customer";
    await users.updateOne({ _id: user.id }, { $set: { role } });
    profile = { ...profile, role };
  }

  return profile;
}

export async function syncClerkUserProfile(userId: string): Promise<UserProfileDocument> {
  const user = await clerkClient.users.getUser(userId);
  return saveClerkUserProfile(user);
}

export async function syncAllClerkUserProfiles(): Promise<void> {
  const pageSize = 100;
  let offset = 0;
  let totalCount = Number.POSITIVE_INFINITY;

  while (offset < totalCount) {
    const page = await clerkClient.users.getUserList({ limit: pageSize, offset });
    totalCount = page.totalCount;
    if (!page.data.length) {
      break;
    }

    await Promise.all(page.data.map(saveClerkUserProfile));
    offset += page.data.length;
  }
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
