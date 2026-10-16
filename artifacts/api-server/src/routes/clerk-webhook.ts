import { verifyWebhook } from "@clerk/express/webhooks";
import { Router, type IRouter, type Request, type Response } from "express";
import { logger } from "../lib/logger";
import {
  deleteClerkUserProfile,
  syncClerkUserProfileFromWebhook,
  type ClerkWebhookUser,
} from "../lib/user-profiles";

const router: IRouter = Router();
type ClerkWebhookEvent = Awaited<ReturnType<typeof verifyWebhook>>;

type ClerkWebhookHandlerDependencies = {
  verifyWebhook: typeof verifyWebhook;
  syncClerkUserProfileFromWebhook: typeof syncClerkUserProfileFromWebhook;
  deleteClerkUserProfile: typeof deleteClerkUserProfile;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return typeof value === "string" || value === null;
}

function parseClerkWebhookUser(data: unknown): ClerkWebhookUser | null {
  if (
    !isRecord(data) ||
    typeof data.id !== "string" ||
    !Array.isArray(data.email_addresses) ||
    !isNullableString(data.primary_email_address_id) ||
    !isNullableString(data.first_name) ||
    !isNullableString(data.last_name) ||
    typeof data.created_at !== "number" ||
    !Number.isFinite(data.created_at) ||
    typeof data.updated_at !== "number" ||
    !Number.isFinite(data.updated_at)
  ) {
    return null;
  }

  const emailAddresses: ClerkWebhookUser["emailAddresses"] = [];
  for (const address of data.email_addresses) {
    if (
      !isRecord(address) ||
      typeof address.id !== "string" ||
      typeof address.email_address !== "string"
    ) {
      return null;
    }

    const verification = isRecord(address.verification) ? address.verification : null;
    const verificationStatus =
      verification && typeof verification.status === "string" ? verification.status : null;
    emailAddresses.push({
      id: address.id,
      emailAddress: address.email_address,
      verificationStatus,
    });
  }

  return {
    id: data.id,
    emailAddresses,
    primaryEmailAddressId: data.primary_email_address_id,
    firstName: data.first_name,
    lastName: data.last_name,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export function createClerkWebhookHandler(
  dependencies: Partial<ClerkWebhookHandlerDependencies> = {},
) {
  const verify = dependencies.verifyWebhook ?? verifyWebhook;
  const syncProfile =
    dependencies.syncClerkUserProfileFromWebhook ?? syncClerkUserProfileFromWebhook;
  const deleteProfile = dependencies.deleteClerkUserProfile ?? deleteClerkUserProfile;

  return async (req: Request, res: Response) => {
    const signingSecret = process.env.CLERK_WEBHOOK_SIGNING_SECRET;
    if (!signingSecret) {
      res.status(503).json({ error: "webhook_signing_secret_unavailable" });
      return;
    }

    let event: ClerkWebhookEvent;
    try {
      event = await verify(req, { signingSecret });
    } catch (error) {
      logger.warn(
        { errorName: error instanceof Error ? error.name : "UnknownError" },
        "Rejected Clerk webhook with an invalid signature",
      );
      res.status(400).json({ error: "invalid_webhook_signature" });
      return;
    }

    try {
      if (event.type === "user.deleted") {
        const userId = isRecord(event.data) ? event.data.id : null;
        if (typeof userId !== "string") {
          res.status(400).json({ error: "invalid_webhook_event" });
          return;
        }
        await deleteProfile(userId);
      } else if (event.type === "user.created" || event.type === "user.updated") {
        const user = parseClerkWebhookUser(event.data);
        if (!user) {
          res.status(400).json({ error: "invalid_webhook_event" });
          return;
        }
        await syncProfile(user);
      }
    } catch (error) {
      logger.error(
        { eventType: event.type, errorName: error instanceof Error ? error.name : "UnknownError" },
        "Could not apply verified Clerk webhook event",
      );
      res.status(500).json({ error: "webhook_processing_failed" });
      return;
    }

    res.status(200).json({ received: true });
  };
}

router.post("/", createClerkWebhookHandler());

export default router;
