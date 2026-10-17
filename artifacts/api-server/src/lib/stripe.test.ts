import assert from "node:assert/strict";
import test from "node:test";
import {
  createStripeCheckoutSession,
  getStripeClient,
  StripeConfigurationError,
} from "./stripe";

test("requires STRIPE_SECRET_KEY before creating a Stripe client", () => {
  const originalSecretKey = process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_SECRET_KEY;

  try {
    assert.throws(
      () => getStripeClient(),
      (error) =>
        error instanceof StripeConfigurationError &&
        error.reason === "stripe_credentials_unavailable",
    );
  } finally {
    if (originalSecretKey === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = originalSecretKey;
  }
});

test("checkout session creation returns the configuration error without a key", async () => {
  const originalSecretKey = process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_SECRET_KEY;

  try {
    await assert.rejects(
      createStripeCheckoutSession({ mode: "payment" }, "missing-stripe-key-test"),
      StripeConfigurationError,
    );
  } finally {
    if (originalSecretKey === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = originalSecretKey;
  }
});
