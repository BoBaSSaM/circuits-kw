import { getAuth } from "@clerk/express";
import {
  CreateCheckoutOrderBody,
  type OrderCurrency,
  type OrderStatus,
} from "@workspace/api-zod";
import {
  convertKwdToCurrency,
  currencyMinorUnitScale,
  roundMoneyAmount,
  toStripeMinorUnits,
  USD_PER_KWD,
} from "@workspace/api-zod";
import { randomUUID } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { ObjectId } from "mongodb";
import Stripe from "stripe";
import { getMongoDatabase } from "../lib/mongo";
import {
  createStripeCheckoutSession,
  getStripeWebhookSettings,
  retrieveStripeCheckoutSession,
  StripeConfigurationError,
  StripeProxyError,
} from "../lib/stripe";
import { logger } from "../lib/logger";
import { OrderInputError, resolveOrderItems, type OrderDocument } from "./orders";

const router: IRouter = Router();

function safeDevelopmentErrorDetail(error: unknown): string | undefined {
  if (process.env.NODE_ENV !== "development") return undefined;
  const message = error instanceof Error ? error.message : "Unknown error.";
  return message.replace(/\b(?:sk|rk)_(?:test|live)_[A-Za-z0-9_]+|\bwhsec_[A-Za-z0-9_]+/g, "[redacted Stripe credential]");
}

export function kwdToStripeMinorUnits(amountKwd: number): number {
  return toStripeMinorUnits(amountKwd, "KWD");
}

function getPublicOrigin(req: Request): string {
  const configuredOrigin = process.env.APP_BASE_URL?.trim();
  const vercelHost = process.env.VERCEL_URL?.trim();
  const replitHost =
    process.env.REPLIT_DOMAINS?.split(",")[0]?.trim() ||
    process.env.REPLIT_DEV_DOMAIN?.trim();
  const requestHost = req.get("host");

  const origin =
    configuredOrigin ||
    (vercelHost ? `https://${vercelHost}` : null) ||
    (replitHost ? `https://${replitHost}` : null) ||
    (requestHost
      ? `${req.get("x-forwarded-proto")?.split(",")[0]?.trim() || (requestHost.startsWith("localhost") ? "http" : "https")}://${requestHost}`
      : null);

  if (!origin) {
    throw new Error("The checkout return origin is not configured.");
  }

  const parsed = new URL(origin);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
    throw new Error("Checkout return URLs must use HTTPS.");
  }

  const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/+$/, "");
  return `${parsed.origin}${basePath}`;
}

function serializePaymentOrder(document: OrderDocument) {
  return {
    id: document._id.toHexString(),
    orderNumber: document.orderNumber,
    placedAt: document.placedAt,
    items: document.items,
    subtotal: document.subtotal,
    currency: document.currency ?? "KWD",
    exchangeRateKwdToUsd: document.exchangeRateKwdToUsd ?? null,
    status: document.status as OrderStatus,
    paymentStatus: document.paymentStatus ?? "pending",
  };
}

async function updateOrderFromPaidSession(session: Stripe.Checkout.Session) {
  const orderId = session.metadata?.orderId;
  if (
    session.payment_status !== "paid" ||
    !orderId ||
    !ObjectId.isValid(orderId)
  ) {
    return null;
  }

  const database = await getMongoDatabase();
  const orders = database.collection<OrderDocument>("orders");
  const filter = {
    _id: new ObjectId(orderId),
    stripeCheckoutSessionId: session.id,
    isDemo: false,
  };
  const document = await orders.findOne(filter);
  const currency: OrderCurrency = document?.currency ?? "KWD";
  if (
    !document ||
    session.currency !== currency.toLowerCase() ||
    session.amount_total !== toStripeMinorUnits(document.subtotal, currency)
  ) {
    return null;
  }

  const paymentIntent =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : (session.payment_intent?.id ?? null);

  await orders.updateOne(
    { ...filter, paymentStatus: { $in: ["pending", "paid"] } },
    {
      $set: {
        paymentStatus: "paid",
        stripePaymentIntentId: paymentIntent,
        paidAt: document.paidAt ?? new Date(),
      },
    },
  );

  return await orders.findOne(filter);
}

async function setSessionPaymentStatus(
  session: Stripe.Checkout.Session,
  paymentStatus: "failed" | "expired",
) {
  const orderId = session.metadata?.orderId;
  if (!orderId || !ObjectId.isValid(orderId)) return;

  const database = await getMongoDatabase();
  await database.collection<OrderDocument>("orders").updateOne(
    {
      _id: new ObjectId(orderId),
      stripeCheckoutSessionId: session.id,
      isDemo: false,
      paymentStatus: "pending",
    },
    { $set: { paymentStatus } },
  );
}

router.post("/stripe/checkout", async (req, res) => {
  const parsed = CreateCheckoutOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_order", details: parsed.error.issues });
    return;
  }
  if (parsed.data.items.some((item) => item.kind === "bom")) {
    res.status(409).json({ error: "supplier_priced_items_unverified" });
    return;
  }

  let order: OrderDocument | undefined;
  try {
    const origin = getPublicOrigin(req);
    const database = await getMongoDatabase();
    const currency: OrderCurrency = "USD";
    const items = (await resolveOrderItems(parsed.data.items, database)).map((item) => ({
      ...item,
      price: convertKwdToCurrency(item.price, currency),
    }));
    const subtotalMinorUnits = items.reduce(
      (sum, item) => sum + toStripeMinorUnits(item.price, currency) * item.qty,
      0,
    );
    const subtotal = roundMoneyAmount(
      subtotalMinorUnits / currencyMinorUnitScale(currency),
      currency,
    );
    if (subtotal <= 0 || items.some((item) => item.price <= 0)) {
      res.status(400).json({ error: "invalid_payment_amount" });
      return;
    }

    const { userId } = getAuth(req);
    const now = new Date();
    order = {
      _id: new ObjectId(),
      orderNumber: `CKW-${Date.now()}-${randomUUID().slice(0, 6).toUpperCase()}`,
      placedAt: now,
      items,
      subtotal,
      currency,
      exchangeRateKwdToUsd: currency === "USD" ? USD_PER_KWD : null,
      status: "new",
      customer: parsed.data.customer,
      shipping: parsed.data.shipping,
      userId: userId ?? null,
      adminNotes: null,
      createdBy: null,
      isDemo: false,
      paymentStatus: "pending",
      stripePaymentIntentId: null,
      paidAt: null,
    };

    const orders = database.collection<OrderDocument>("orders");
    await orders.insertOne(order);

    const session = await createStripeCheckoutSession(
      {
        mode: "payment",
        customer_email: order.customer.email,
        client_reference_id: order._id.toHexString(),
        metadata: {
          orderId: order._id.toHexString(),
          orderNumber: order.orderNumber,
        },
        line_items: order.items.map((item) => ({
          quantity: item.qty,
          price_data: {
            currency: currency.toLowerCase(),
            unit_amount: toStripeMinorUnits(item.price, currency),
            product_data: {
              name: item.name,
              metadata: { sku: item.sku, kind: item.kind },
            },
          },
        })),
        success_url: `${origin}/checkout?stripe=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/checkout?stripe=cancelled`,
      },
      order._id.toHexString(),
    );

    if (!session.url) {
      throw new Error("Stripe did not return a Checkout URL.");
    }

    await orders.updateOne(
      { _id: order._id },
      { $set: { stripeCheckoutSessionId: session.id } },
    );
    res.status(201).json({
      checkoutUrl: session.url,
      orderNumber: order.orderNumber,
    });
  } catch (error) {
    if (order) {
      try {
        const database = await getMongoDatabase();
        await database.collection<OrderDocument>("orders").updateOne(
          { _id: order._id, paymentStatus: "pending" },
          { $set: { paymentStatus: "failed" } },
        );
      } catch {
        // The first failure is returned; a second database failure must not hide it.
      }
    }

    if (error instanceof OrderInputError) {
      res.status(error.statusCode).json({ error: error.errorCode });
      return;
    }
    if (error instanceof StripeConfigurationError) {
      logger.error({ stripeConfigurationReason: error.reason }, "Stripe credentials unavailable");
      res.status(503).json({
        error: "payment_not_configured",
        ...(safeDevelopmentErrorDetail(error) ? { details: safeDevelopmentErrorDetail(error) } : {}),
      });
      return;
    }
    const stripeStatus =
      error instanceof StripeProxyError
        ? error.status
        : error instanceof Stripe.errors.StripeError
          ? error.statusCode ?? null
          : null;
    const stripeRejectedRequest =
      stripeStatus !== null && stripeStatus >= 400 && stripeStatus < 500;
    logger.error(
      {
        errorName: error instanceof Error ? error.name : "UnknownError",
        ...(error instanceof Stripe.errors.StripeError
          ? { stripeType: error.type, stripeCode: error.code ?? null }
          : {}),
        ...(error instanceof StripeProxyError
          ? { stripeType: error.stripeType, stripeCode: error.stripeCode, stripeStatus: error.status }
          : {}),
        ...(safeDevelopmentErrorDetail(error)
          ? { developmentDetails: safeDevelopmentErrorDetail(error) }
          : {}),
      },
      "Could not create Stripe Checkout session",
    );
    res.status(stripeRejectedRequest ? 400 : 503).json({
      error: stripeRejectedRequest ? "stripe_checkout_rejected" : "stripe_checkout_unavailable",
      ...(safeDevelopmentErrorDetail(error) ? { details: safeDevelopmentErrorDetail(error) } : {}),
    });
  }
});

router.get("/stripe/verify", async (req, res) => {
  const sessionId = typeof req.query.session_id === "string" ? req.query.session_id : "";
  if (!sessionId.startsWith("cs_")) {
    res.status(400).json({ error: "invalid_checkout_session" });
    return;
  }

  try {
    const session = await retrieveStripeCheckoutSession(sessionId);
    if (session.payment_status !== "paid") {
      res.status(409).json({ error: "payment_not_completed" });
      return;
    }

    const order = await updateOrderFromPaidSession(session);
    if (!order) {
      res.status(409).json({ error: "payment_order_mismatch" });
      return;
    }

    res.json(serializePaymentOrder(order));
  } catch (error) {
    logger.error(
      {
        errorName: error instanceof Error ? error.name : "UnknownError",
        ...(error instanceof StripeProxyError
          ? { stripeType: error.stripeType, stripeCode: error.stripeCode, stripeStatus: error.status }
          : {}),
        ...(safeDevelopmentErrorDetail(error)
          ? { developmentDetails: safeDevelopmentErrorDetail(error) }
          : {}),
      },
      "Could not verify Stripe Checkout session",
    );
    res.status(503).json({
      error: "payment_verification_unavailable",
      ...(safeDevelopmentErrorDetail(error) ? { details: safeDevelopmentErrorDetail(error) } : {}),
    });
  }
});

export async function stripeWebhookHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const signature = req.header("stripe-signature");
  if (!signature || !Buffer.isBuffer(req.body)) {
    res.status(400).json({ error: "invalid_stripe_webhook" });
    return;
  }

  try {
    const { secretKey, webhookSecret } = getStripeWebhookSettings();
    if (!webhookSecret || !secretKey) {
      res.status(503).json({ error: "stripe_webhook_not_configured" });
      return;
    }

    const stripe = new Stripe(secretKey, { maxNetworkRetries: 2, timeout: 15_000 });
    const event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
    const session = event.data.object as Stripe.Checkout.Session;

    if (
      (event.type === "checkout.session.completed" ||
        event.type === "checkout.session.async_payment_succeeded") &&
      session.payment_status === "paid"
    ) {
      const order = await updateOrderFromPaidSession(session);
      if (!order) {
        logger.warn({ eventType: event.type }, "Stripe payment did not match a pending Circuits KW order");
      }
    } else if (event.type === "checkout.session.expired") {
      await setSessionPaymentStatus(session, "expired");
    } else if (event.type === "checkout.session.async_payment_failed") {
      await setSessionPaymentStatus(session, "failed");
    }

    res.json({ received: true });
  } catch (error) {
    if (error instanceof StripeConfigurationError) {
      res.status(503).json({ error: "stripe_webhook_not_configured" });
      return;
    }
    logger.error(
      { errorName: error instanceof Error ? error.name : "UnknownError" },
      "Could not process Stripe webhook",
    );
    res.status(400).json({ error: "invalid_stripe_webhook" });
  }
}

export default router;
