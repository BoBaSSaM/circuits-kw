import assert from "node:assert/strict";
import test from "node:test";
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
