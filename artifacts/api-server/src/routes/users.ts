import { clerkClient, getAuth } from "@clerk/express";
import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";
import { getMongoDatabase } from "../lib/mongo";

type UserProfileDocument = {
  _id: string;
  clerkUserId: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  clerkCreatedAt: Date;
  clerkUpdatedAt: Date;
  lastSyncedAt: Date;
  createdAt: Date;
};

const router: IRouter = Router();

router.put("/users/me", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "authentication_required" });
    return;
  }

  try {
    const user = await clerkClient.users.getUser(userId);
    const primaryEmail = user.emailAddresses.find(
      (address) => address.id === user.primaryEmailAddressId,
    )?.emailAddress;
    const now = new Date();
    const database = await getMongoDatabase();
    const users = database.collection<UserProfileDocument>("users");

    await users.updateOne(
      { _id: user.id },
      {
        $set: {
          clerkUserId: user.id,
          email: primaryEmail ?? null,
          firstName: user.firstName ?? null,
          lastName: user.lastName ?? null,
          clerkCreatedAt: new Date(user.createdAt),
          clerkUpdatedAt: new Date(user.updatedAt),
          lastSyncedAt: now,
        },
        $setOnInsert: {
          createdAt: now,
        },
      },
      { upsert: true },
    );

    res.status(200).json({ ok: true });
  } catch (error) {
    logger.error(
      { errorName: error instanceof Error ? error.name : "UnknownError" },
      "Could not sync authenticated profile to MongoDB",
    );
    res.status(503).json({ error: "profile_sync_failed" });
  }
});

export default router;
