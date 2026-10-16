import assert from "node:assert/strict";
import test from "node:test";
import {
  backfillClerkUserProfiles,
  getBackfillCommandExitCode,
} from "./user-profiles";

const user = (id: string) =>
  ({
    id,
    emailAddresses: [],
    primaryEmailAddressId: null,
    firstName: null,
    lastName: null,
    createdAt: 1,
    updatedAt: 1,
  }) as const;

test("profile backfill counts a failed save and still attempts the rest of the page", async () => {
  const attempted: string[] = [];
  const personalDetails = "private-customer@example.test";
  const result = await backfillClerkUserProfiles({
    getUserList: async () => ({
      data: [user("failed-user"), user("later-user")],
      totalCount: 2,
    }),
    saveUserProfile: async ({ id }) => {
      attempted.push(id);
      if (id === "failed-user") {
        throw new Error(personalDetails);
      }
    },
  });

  assert.deepEqual(attempted, ["failed-user", "later-user"]);
  assert.deepEqual(result, {
    succeededCount: 1,
    failedCount: 1,
    complete: true,
  });
  assert.deepEqual(Object.keys(result).sort(), ["complete", "failedCount", "succeededCount"]);
  assert.equal(JSON.stringify(result).includes(personalDetails), false);
});

test("profile backfill processes every full and final partial page", async () => {
  const pageRequests: { limit: number; offset: number }[] = [];
  const saved: string[] = [];
  const result = await backfillClerkUserProfiles({
    getUserList: async ({ limit, offset }) => {
      pageRequests.push({ limit, offset });
      if (offset === 0) {
        return {
          data: Array.from({ length: limit }, (_, index) => user(`user-${index}`)),
          totalCount: 102,
        };
      }
      return {
        data: [user("user-100"), user("user-101")],
        totalCount: 102,
      };
    },
    saveUserProfile: async ({ id }) => {
      saved.push(id);
    },
  });

  assert.deepEqual(pageRequests, [
    { limit: 100, offset: 0 },
    { limit: 100, offset: 100 },
  ]);
  assert.equal(saved.length, 102);
  assert.deepEqual(result, { succeededCount: 102, failedCount: 0, complete: true });
});

test("profile backfill marks a short non-final page incomplete", async () => {
  const offsets: number[] = [];
  const result = await backfillClerkUserProfiles({
    getUserList: async ({ offset }) => {
      offsets.push(offset);
      return {
        data: Array.from({ length: 50 }, (_, index) => user(`user-${index}`)),
        totalCount: 150,
      };
    },
    saveUserProfile: async () => {},
  });

  assert.deepEqual(offsets, [0]);
  assert.deepEqual(result, { succeededCount: 50, failedCount: 0, complete: false });
});

test("profile backfill stops and marks listing failures incomplete", async () => {
  const offsets: number[] = [];
  const result = await backfillClerkUserProfiles({
    getUserList: async ({ offset }) => {
      offsets.push(offset);
      if (offset > 0) {
        throw new Error("listing failed");
      }
      return {
        data: Array.from({ length: 100 }, (_, index) => user(`user-${index}`)),
        totalCount: 150,
      };
    },
    saveUserProfile: async () => {},
  });

  assert.deepEqual(offsets, [0, 100]);
  assert.deepEqual(result, { succeededCount: 100, failedCount: 0, complete: false });
  assert.equal(getBackfillCommandExitCode(result), 1);
});

test("profile backfill marks an unexpectedly empty page incomplete", async () => {
  const offsets: number[] = [];
  const result = await backfillClerkUserProfiles({
    getUserList: async ({ offset }) => {
      offsets.push(offset);
      if (offset === 0) {
        return {
          data: Array.from({ length: 100 }, (_, index) => user(`user-${index}`)),
          totalCount: 101,
        };
      }
      return { data: [], totalCount: 101 };
    },
    saveUserProfile: async () => {},
  });

  assert.deepEqual(offsets, [0, 100]);
  assert.deepEqual(result, { succeededCount: 100, failedCount: 0, complete: false });
  assert.equal(getBackfillCommandExitCode(result), 1);
});

test("backfill command exits nonzero for failed profiles or an incomplete listing", () => {
  assert.equal(
    getBackfillCommandExitCode({ succeededCount: 2, failedCount: 1, complete: true }),
    1,
  );
  assert.equal(
    getBackfillCommandExitCode({ succeededCount: 0, failedCount: 0, complete: false }),
    1,
  );
  assert.equal(
    getBackfillCommandExitCode({ succeededCount: 2, failedCount: 0, complete: true }),
    0,
  );
});
