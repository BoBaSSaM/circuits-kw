import { getAuth } from "@clerk/express";
import type { RequestHandler } from "express";
import { logger } from "./logger";
import {
  getOrSyncUserProfile,
  normalizeDashboardRole,
  type DashboardRole,
} from "./user-profiles";

export const requireDashboardRoles = (...roles: DashboardRole[]): RequestHandler => {
  return async (req, res, next) => {
    const { userId } = getAuth(req);
    if (!userId) {
      res.status(401).json({ error: "authentication_required" });
      return;
    }

    try {
      const profile = await getOrSyncUserProfile(userId);
      const role = normalizeDashboardRole(profile.role);
      if (!roles.includes(role)) {
        res.status(403).json({ error: "dashboard_access_denied" });
        return;
      }

      res.locals.dashboardProfile = { ...profile, role };
      next();
    } catch (error) {
      logger.error(
        { errorName: error instanceof Error ? error.name : "UnknownError" },
        "Could not verify dashboard access",
      );
      res.status(503).json({ error: "dashboard_access_unavailable" });
    }
  };
};
