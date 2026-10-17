import { ReplitConnectors } from "@replit/connectors-sdk";
import Stripe from "stripe";

export class StripeConfigurationError extends Error {
  constructor(
    public readonly reason: string,
    message: string,
  ) {
    super(message);
    this.name = "StripeConfigurationError";
  }
}

export class StripeProxyError extends Error {
  constructor(
    message: string,
    public readonly status: number | null = null,
    public readonly stripeType: string | null = null,
    public readonly stripeCode: string | null = null,
  ) {
    super(message);
    this.name = "StripeProxyError";
  }
}

type StripeErrorResponse = {
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
};

function appendStripeParameter(
  params: URLSearchParams,
  key: string,
  value: unknown,
): void {
  if (value === undefined || value === null) return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      const entryKey =
        typeof entry === "object" && entry !== null
          ? `${key}[${index}]`
          : `${key}[]`;
      appendStripeParameter(params, entryKey, entry);
    });
    return;
  }
  if (typeof value === "object") {
    for (const [nestedKey, nestedValue] of Object.entries(value)) {
      appendStripeParameter(params, `${key}[${nestedKey}]`, nestedValue);
    }
    return;
  }
  params.append(key, String(value));
}

function encodeStripeParameters(
  parameters: Stripe.Checkout.SessionCreateParams,
): URLSearchParams {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(parameters)) {
    appendStripeParameter(body, key, value);
  }
  return body;
}

async function parseProxyResponse<T>(
  response: Response,
): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as T & StripeErrorResponse;
  if (!response.ok) {
    throw new StripeProxyError(
      payload.error?.message || `Stripe returned HTTP ${response.status}.`,
      response.status,
      payload.error?.type ?? null,
      payload.error?.code ?? null,
    );
  }
  return payload;
}

function directStripeClient(): Stripe | null {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  return secretKey ? new Stripe(secretKey, { maxNetworkRetries: 2, timeout: 15_000 }) : null;
}

function toConfigurationError(error: unknown): StripeConfigurationError {
  const detail = error instanceof Error ? error.message : "";
  return new StripeConfigurationError(
    "stripe_credentials_unavailable",
    `No STRIPE_SECRET_KEY is set and the Replit Stripe connection is unavailable${detail ? `: ${detail}` : "."}`,
  );
}

export function getStripeWebhookSettings(): {
  secretKey: string | null;
  webhookSecret: string | null;
} {
  return {
    secretKey: process.env.STRIPE_SECRET_KEY?.trim() || null,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET?.trim() || null,
  };
}

export async function createStripeCheckoutSession(
  parameters: Stripe.Checkout.SessionCreateParams,
  idempotencyKey: string,
): Promise<Stripe.Checkout.Session> {
  const stripe = directStripeClient();
  if (stripe) {
    return stripe.checkout.sessions.create(parameters, { idempotencyKey });
  }

  try {
    const response = await new ReplitConnectors().proxy(
      "stripe",
      "/v1/checkout/sessions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Idempotency-Key": idempotencyKey,
        },
        body: encodeStripeParameters(parameters),
      },
    );
    return await parseProxyResponse<Stripe.Checkout.Session>(response);
  } catch (error) {
    if (error instanceof StripeProxyError) throw error;
    throw toConfigurationError(error);
  }
}

export async function retrieveStripeCheckoutSession(
  sessionId: string,
): Promise<Stripe.Checkout.Session> {
  const stripe = directStripeClient();
  if (stripe) {
    return stripe.checkout.sessions.retrieve(sessionId);
  }

  try {
    const response = await new ReplitConnectors().proxy(
      "stripe",
      `/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
      { method: "GET" },
    );
    return await parseProxyResponse<Stripe.Checkout.Session>(response);
  } catch (error) {
    if (error instanceof StripeProxyError) throw error;
    throw toConfigurationError(error);
  }
}
