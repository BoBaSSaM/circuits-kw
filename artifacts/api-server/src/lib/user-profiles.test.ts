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
