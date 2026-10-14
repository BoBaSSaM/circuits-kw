import { getAuth } from "@clerk/express";
import { SyncCurrentUserResponse } from "@workspace/api-zod";
import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";
import { syncClerkUserProfile } from "../lib/user-profiles";

const router: IRouter = Router();

router.put("/users/me", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "authentication_required" });
    return;
  }

  try {
    const profile = await syncClerkUserProfile(userId);
    res.status(200).json(SyncCurrentUserResponse.parse({ ok: true, role: profile.role }));
  } catch (error) {
    logger.error(
      { errorName: error instanceof Error ? error.name : "UnknownError" },
      "Could not sync authenticated profile to MongoDB",
    );
    res.status(503).json({ error: "profile_sync_failed" });
  }
});

export default router;
