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

export function getStripeClient(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) {
    throw new StripeConfigurationError(
      "stripe_credentials_unavailable",
      "STRIPE_SECRET_KEY is required to use Stripe.",
    );
  }
  return new Stripe(secretKey, { maxNetworkRetries: 2, timeout: 15_000 });
}

export function getStripeWebhookSettings(): { webhookSecret: string | null } {
  return { webhookSecret: process.env.STRIPE_WEBHOOK_SECRET?.trim() || null };
}

export async function createStripeCheckoutSession(
  parameters: Stripe.Checkout.SessionCreateParams,
  idempotencyKey: string,
): Promise<Stripe.Checkout.Session> {
  return getStripeClient().checkout.sessions.create(parameters, { idempotencyKey });
}

export async function retrieveStripeCheckoutSession(
  sessionId: string,
): Promise<Stripe.Checkout.Session> {
  return getStripeClient().checkout.sessions.retrieve(sessionId);
}
