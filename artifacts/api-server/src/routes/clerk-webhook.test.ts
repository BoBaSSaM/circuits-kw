import assert from "node:assert/strict";
import test from "node:test";
import type { Request, Response } from "express";
import type { getMongoDatabase } from "../lib/mongo";
import {
  deleteClerkUserProfile,
  syncClerkUserProfileFromWebhook,
} from "../lib/user-profiles";
import { createClerkWebhookHandler } from "./clerk-webhook";

type WebhookEvent = {
  type: string;
  data: Record<string, unknown>;
};

function responseRecorder() {
  const result: { statusCode: number; body?: unknown } = { statusCode: 200 };
  const response = {
    status(code: number) {
      result.statusCode = code;
      return response;
    },
    json(body: unknown) {
      result.body = body;
      return response;
    },
  } as unknown as Response;
  return { response, result };
}

function request(): Request {
  return {} as Request;
}

function eventVerifier(eventOrError: WebhookEvent | Error) {
  return async () => {
    if (eventOrError instanceof Error) throw eventOrError;
    return eventOrError as Awaited<
      ReturnType<typeof import("@clerk/express/webhooks").verifyWebhook>
    >;
  };
}

function profileEvent(): WebhookEvent {
  return {
    type: "user.updated",
    data: {
      id: "clerk-user-1",
      email_addresses: [
        {
          id: "email-1",
          email_address: "buyer@example.test",
          verification: { status: "verified" },
          linked_to: [{ id: "oauth-account-1", type: "oauth_google" }],
        },
      ],
      primary_email_address_id: "email-1",
      first_name: "Buyer",
      last_name: "Example",
      created_at: 1_700_000_000_000,
      updated_at: 1_700_000_001_000,
      password_hash: "must-not-persist",
      password: "must-not-persist",
      private_metadata: { access_token: "must-not-persist" },
      public_metadata: { harmless: "also-not-allowlisted" },
      unsafe_metadata: { refresh_token: "must-not-persist" },
      oauth_access_tokens: [{ token: "must-not-persist" }],
      backup_codes: ["must-not-persist"],
    },
  };
}

test("invalid Clerk signatures are rejected before any profile write", async () => {
  const originalSecret = process.env.CLERK_WEBHOOK_SIGNING_SECRET;
  process.env.CLERK_WEBHOOK_SIGNING_SECRET = "test-secret";
  let writeCalls = 0;
  const handler = createClerkWebhookHandler({
    verifyWebhook: eventVerifier(new Error("invalid signature")),
    syncClerkUserProfileFromWebhook: async () => {
      writeCalls += 1;
      throw new Error("must not be called");
    },
  });
  const { response, result } = responseRecorder();

  try {
    await handler(request(), response);
  } finally {
    if (originalSecret === undefined) delete process.env.CLERK_WEBHOOK_SIGNING_SECRET;
    else process.env.CLERK_WEBHOOK_SIGNING_SECRET = originalSecret;
  }

  assert.equal(result.statusCode, 400);
  assert.deepEqual(result.body, { error: "invalid_webhook_signature" });
  assert.equal(writeCalls, 0);
});

test("verified profile events save only the allowlisted, non-credential fields", async () => {
  const originalSecret = process.env.CLERK_WEBHOOK_SIGNING_SECRET;
  process.env.CLERK_WEBHOOK_SIGNING_SECRET = "test-secret";
  let savedFields: Record<string, unknown> | undefined;
  const persistedProfile = {
    _id: "clerk-user-1",
    clerkUserId: "clerk-user-1",
    email: "buyer@example.test",
    firstName: "Buyer",
    lastName: "Example",
    primaryEmailVerified: true,
    role: "customer" as const,
    clerkCreatedAt: new Date(1_700_000_000_000),
    clerkUpdatedAt: new Date(1_700_000_001_000),
    lastSyncedAt: new Date(1_700_000_002_000),
    createdAt: new Date(1_700_000_000_000),
  };
  const database = {
    collection: () => ({
      updateOne: async (_filter: unknown, update: { $set: Record<string, unknown> }) => {
        savedFields = update.$set;
      },
      findOne: async () => persistedProfile,
    }),
  } as unknown as Awaited<ReturnType<typeof getMongoDatabase>>;
  const getDatabase = async () => database;
  const handler = createClerkWebhookHandler({
    verifyWebhook: eventVerifier(profileEvent()),
    syncClerkUserProfileFromWebhook: (user) =>
      syncClerkUserProfileFromWebhook(user, getDatabase),
  });
  const { response, result } = responseRecorder();

  try {
    await handler(request(), response);
  } finally {
    if (originalSecret === undefined) delete process.env.CLERK_WEBHOOK_SIGNING_SECRET;
    else process.env.CLERK_WEBHOOK_SIGNING_SECRET = originalSecret;
  }

  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.body, { received: true });
  assert.deepEqual(savedFields, {
    clerkUserId: "clerk-user-1",
    email: "buyer@example.test",
    firstName: "Buyer",
    lastName: "Example",
    primaryEmailVerified: true,
    clerkCreatedAt: new Date(1_700_000_000_000),
    clerkUpdatedAt: new Date(1_700_000_001_000),
    lastSyncedAt: savedFields?.lastSyncedAt,
    createdAt: new Date(1_700_000_000_000),
  });
  assert.deepEqual(
    Object.keys(savedFields ?? {}).sort(),
    [
      "clerkCreatedAt",
      "clerkUpdatedAt",
      "clerkUserId",
      "createdAt",
      "email",
      "firstName",
      "lastName",
      "lastSyncedAt",
      "primaryEmailVerified",
    ].sort(),
  );
  assert.equal(JSON.stringify(savedFields).includes("must-not-persist"), false);
  assert.equal(JSON.stringify(savedFields).includes("access_token"), false);
  assert.equal(JSON.stringify(savedFields).includes("refresh_token"), false);
});

test("repeated user.deleted events safely leave no matching profile", async () => {
  const originalSecret = process.env.CLERK_WEBHOOK_SIGNING_SECRET;
  process.env.CLERK_WEBHOOK_SIGNING_SECRET = "test-secret";
  const profiles = [
    { _id: "clerk-user-1", clerkUserId: "clerk-user-1" },
    { _id: "legacy-id", clerkUserId: "clerk-user-1" },
    { _id: "other-user", clerkUserId: "other-user" },
  ];
  const database = {
    collection: () => ({
      deleteMany: async (filter: { $or: { _id?: string; clerkUserId?: string }[] }) => {
        for (let index = profiles.length - 1; index >= 0; index -= 1) {
          if (
            filter.$or.some((candidate) =>
              Object.entries(candidate).some(
                ([key, value]) => profiles[index][key as "_id" | "clerkUserId"] === value,
              ),
            )
          ) {
            profiles.splice(index, 1);
          }
        }
      },
    }),
  } as unknown as Awaited<ReturnType<typeof getMongoDatabase>>;
  const getDatabase = async () => database;
  const deletionEvent: WebhookEvent = {
    type: "user.deleted",
    data: { id: "clerk-user-1" },
  };
  const handler = createClerkWebhookHandler({
    verifyWebhook: eventVerifier(deletionEvent),
    deleteClerkUserProfile: (userId) => deleteClerkUserProfile(userId, getDatabase),
  });

  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { response, result } = responseRecorder();
      await handler(request(), response);
      assert.equal(result.statusCode, 200);
      assert.deepEqual(result.body, { received: true });
    }
  } finally {
    if (originalSecret === undefined) delete process.env.CLERK_WEBHOOK_SIGNING_SECRET;
    else process.env.CLERK_WEBHOOK_SIGNING_SECRET = originalSecret;
  }

  assert.deepEqual(profiles, [{ _id: "other-user", clerkUserId: "other-user" }]);
});
