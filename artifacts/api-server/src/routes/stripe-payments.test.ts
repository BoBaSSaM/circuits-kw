import assert from "node:assert/strict";
import test from "node:test";
import { convertKwdToCurrency, toStripeMinorUnits, USD_PER_KWD } from "@workspace/api-zod";
import { kwdToStripeMinorUnits } from "./stripe-payments";

test("converts Kuwaiti dinars to Stripe fils", () => {
  assert.equal(kwdToStripeMinorUnits(2.85), 2850);
  assert.equal(kwdToStripeMinorUnits(1.234), 1234);
  assert.equal(kwdToStripeMinorUnits(0.001), 1);
});

test("rejects zero, negative, and non-finite payment amounts", () => {
  for (const amount of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 0.0001, 1.2345]) {
    assert.throws(() => kwdToStripeMinorUnits(amount));
  }
});

test("converts KWD catalog prices to USD at the confirmed fixed rate", () => {
  assert.equal(USD_PER_KWD, 3.3);
  assert.equal(convertKwdToCurrency(2.85, "USD"), 9.41);
  assert.equal(toStripeMinorUnits(9.41, "USD"), 941);
  assert.equal(convertKwdToCurrency(2.85, "KWD"), 2.85);
});
