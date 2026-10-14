import { getAuth } from "@clerk/express";
import {
  GetAdminAccessResponse,
  GetAdminUsersResponse,
  UpdateUserRoleBody,
  UpdateUserRoleParams,
  UpdateUserRoleResponse,
} from "@workspace/api-zod";
import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";
import { requireDashboardRoles } from "../lib/dashboard-auth";
import { getMongoDatabase } from "../lib/mongo";
import {
  getOrSyncUserProfile,
  isBootstrapAdmin,
  normalizeDashboardRole,
  syncAllClerkUserProfiles,
  type UserProfileDocument,
} from "../lib/user-profiles";

const router: IRouter = Router();

router.get("/admin/access", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "authentication_required" });
    return;
  }

  try {
    const profile = await getOrSyncUserProfile(userId);
    const name = [profile.firstName, profile.lastName].filter(Boolean).join(" ") || null;
    res.json(
      GetAdminAccessResponse.parse({
        id: profile.clerkUserId,
        email: profile.email,
        name,
        role: normalizeDashboardRole(profile.role),
      }),
    );
  } catch (error) {
    logger.error(
      { errorName: error instanceof Error ? error.name : "UnknownError" },
      "Could not load the signed-in user's dashboard role",
    );
    res.status(503).json({ error: "dashboard_access_unavailable" });
  }
});

router.get(
  "/admin/users",
  requireDashboardRoles("admin"),
  async (_req, res) => {
    try {
      await syncAllClerkUserProfiles();
      const database = await getMongoDatabase();
      const users = await database
        .collection<UserProfileDocument>("users")
        .find(
          {},
          {
            projection: {
              _id: 1,
              clerkUserId: 1,
              email: 1,
              firstName: 1,
              lastName: 1,
              role: 1,
              createdAt: 1,
              lastSyncedAt: 1,
            },
          },
        )
        .sort({ createdAt: -1 })
        .toArray();
      res.json(
        GetAdminUsersResponse.parse({
          users: users.map((profile) => ({
            id: profile.clerkUserId,
            email: profile.email,
            firstName: profile.firstName,
            lastName: profile.lastName,
            role: normalizeDashboardRole(profile.role),
            createdAt: profile.createdAt,
            lastSyncedAt: profile.lastSyncedAt,
          })),
        }),
      );
    } catch (error) {
      logger.error(
        { errorName: error instanceof Error ? error.name : "UnknownError" },
        "Could not load user profiles for dashboard",
      );
      res.status(503).json({ error: "users_unavailable" });
    }
  },
);

router.patch(
  "/admin/users/:id",
  requireDashboardRoles("admin"),
  async (req, res) => {
    const params = UpdateUserRoleParams.safeParse(req.params);
    const parsed = UpdateUserRoleBody.safeParse(req.body);
    if (!params.success || !parsed.success) {
      res.status(400).json({
        error: "invalid_user_role",
        details: [
          ...(params.success ? [] : params.error.issues),
          ...(parsed.success ? [] : parsed.error.issues),
        ],
      });
      return;
    }

    try {
      const database = await getMongoDatabase();
      const users = database.collection<UserProfileDocument>("users");
      const target = await users.findOne({ _id: params.data.id });
      if (!target) {
        res.status(404).json({ error: "user_not_found" });
        return;
      }

      if (isBootstrapAdmin(target) && parsed.data.role !== "admin") {
        res.status(409).json({ error: "bootstrap_admin_cannot_be_demoted" });
        return;
      }

      if (
        normalizeDashboardRole(target.role) === "admin" &&
        parsed.data.role !== "admin" &&
        (await users.countDocuments({ role: "admin" })) <= 1
      ) {
        res.status(409).json({ error: "last_admin_cannot_be_demoted" });
        return;
      }

      await users.updateOne({ _id: params.data.id }, { $set: { role: parsed.data.role } });
      res.json(
        UpdateUserRoleResponse.parse({
          id: target.clerkUserId,
          email: target.email,
          firstName: target.firstName,
          lastName: target.lastName,
          role: parsed.data.role,
        }),
      );
    } catch (error) {
      logger.error(
        { errorName: error instanceof Error ? error.name : "UnknownError" },
        "Could not change a user's dashboard role",
      );
      res.status(503).json({ error: "user_role_update_failed" });
    }
  },
);

export default router;
