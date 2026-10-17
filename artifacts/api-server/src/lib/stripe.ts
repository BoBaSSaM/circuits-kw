import Stripe from "stripe";

export class StripeConfigurationError extends Error {
  constructor() {
    super("Stripe is not configured for this runtime.");
    this.name = "StripeConfigurationError";
  }
}

type StripeSettings = {
  secret_key?: string;
  webhook_secret?: string;
};

type ReplitConnectionResponse = {
  items?: Array<{ settings?: StripeSettings }>;
};

export async function getStripeSettings(): Promise<{
  secretKey: string;
  webhookSecret: string | null;
}> {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (secretKey) {
    return {
      secretKey,
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET?.trim() || null,
    };
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const replitToken = process.env.REPL_IDENTITY
    ? `repl ${process.env.REPL_IDENTITY}`
    : process.env.WEB_REPL_RENEWAL
      ? `depl ${process.env.WEB_REPL_RENEWAL}`
      : null;

  if (!hostname || !replitToken) {
    throw new StripeConfigurationError();
  }

  let response: Response;
  try {
    response = await fetch(
      `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=stripe`,
      {
        headers: {
          Accept: "application/json",
          X_REPLIT_TOKEN: replitToken,
        },
        signal: AbortSignal.timeout(10_000),
      },
    );
  } catch {
    throw new StripeConfigurationError();
  }

  if (!response.ok) {
    throw new StripeConfigurationError();
  }

  const connection = (await response.json()) as ReplitConnectionResponse;
  const settings = connection.items?.[0]?.settings;
  if (!settings?.secret_key) {
    throw new StripeConfigurationError();
  }

  return {
    secretKey: settings.secret_key,
    webhookSecret: settings.webhook_secret?.trim() || null,
  };
}

export async function getStripeClient(): Promise<Stripe> {
  const { secretKey } = await getStripeSettings();
  return new Stripe(secretKey, { maxNetworkRetries: 2, timeout: 15_000 });
}
