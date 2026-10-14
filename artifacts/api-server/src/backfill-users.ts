import { closeMongoConnection } from "./lib/mongo";
import { backfillClerkUserProfiles } from "./lib/user-profiles";

let result = { succeededCount: 0, failedCount: 0, complete: false };

try {
  result = await backfillClerkUserProfiles();
} catch {
  // Keep command output limited to aggregate results.
} finally {
  try {
    await closeMongoConnection();
  } catch {
    result.complete = false;
  }
}

console.info(
  `Clerk user profile backfill: ${result.succeededCount} succeeded, ${result.failedCount} failed, complete=${result.complete}.`,
);

if (!result.complete || result.failedCount > 0) {
  process.exitCode = 1;
}
