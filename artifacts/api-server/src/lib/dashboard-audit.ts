import type { DashboardRole, UserProfileDocument } from "./user-profiles";
import type { Db } from "mongodb";
import { randomUUID } from "node:crypto";

export type AuditAction = "created" | "updated" | "deleted";
export type AuditRecordType = "product" | "project_kit" | "order" | "user";
export type AuditValue = string | number | boolean | null;
export type AuditDetails = Record<string, AuditValue>;

export type DashboardAuditActor = {
  actorId: string;
  actorName: string | null;
  actorRole: DashboardRole;
};

export type DashboardAuditInput = DashboardAuditActor & {
  action: AuditAction;
  recordType: AuditRecordType;
  recordId: string;
  before: AuditDetails | null;
  after: AuditDetails | null;
};

export type DashboardAuditDocument = DashboardAuditInput & {
  _id: string;
  timestamp: Date;
};

export function getDashboardAuditActor(
  profile: UserProfileDocument & { role: DashboardRole },
): DashboardAuditActor {
  const actorName = [profile.firstName, profile.lastName].filter(Boolean).join(" ");
  return {
    actorId: profile.clerkUserId,
    actorName: actorName || null,
    actorRole: profile.role,
  };
}

export async function appendDashboardAudit(
  database: Db,
  entry: DashboardAuditInput,
): Promise<void> {
  await database.collection<DashboardAuditDocument>("dashboard_audit").insertOne({
    _id: randomUUID(),
    ...entry,
    timestamp: new Date(),
  });
}
