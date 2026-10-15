import assert from "node:assert/strict";
import test from "node:test";
import type { Request, Response } from "express";
import type { getMongoDatabase } from "../lib/mongo";
import { createAccountOrdersHandler } from "./orders";

type TestOrder = {
  _id: { toHexString: () => string };
  orderNumber: string;
  placedAt: Date;
  items: { id: string; kind: "component"; sku: string; name: string; price: number; qty: number }[];
  subtotal: number;
  status: "new";
  customer: { name: string; email: string; phone: string };
  shipping: {
    governorate: string;
    area: string;
    block: string;
    street: string;
    building: string;
    notes: string | null;
  };
  userId: string | null;
  adminNotes: null;
  createdBy: null;
  isDemo: boolean;
};

function order(id: string, userId: string | null, isDemo = true): TestOrder {
  return {
    _id: { toHexString: () => id },
    orderNumber: `CKW-${id}`,
    placedAt: new Date("2026-10-15T12:00:00.000Z"),
    items: [{ id: `part-${id}`, kind: "component", sku: `SKU-${id}`, name: `Part ${id}`, price: 1.25, qty: 1 }],
    subtotal: 1.25,
    status: "new",
    customer: { name: "Buyer", email: "buyer@example.com", phone: "+965 5555 5555" },
    shipping: {
      governorate: "Capital",
      area: "Kuwait City",
      block: "1",
      street: "Main Street",
      building: "10",
      notes: null,
    },
    userId,
    adminNotes: null,
    createdBy: null,
    isDemo,
  };
}

function responseRecorder() {
  const result: { statusCode: number; body?: unknown } = { statusCode: 200 };
  const response = {
    status(code: number) {
      result.statusCode = code;
      return response;
    },
    json(body: unknown) {
      result.body = body;
      return response;
    },
  } as unknown as Response;
  return { response, result };
}

function makeHandler(orders: TestOrder[]) {
  const queries: { userId: string; isDemo: true }[] = [];
  let databaseCalls = 0;
  const database = {
    collection: (name: string) => {
      assert.equal(name, "orders");
      return {
        find: (filter: { userId: string; isDemo: true }) => {
          queries.push(filter);
          return {
            sort: (sort: { placedAt: -1 }) => {
              assert.deepEqual(sort, { placedAt: -1 });
              return {
                toArray: async () =>
                  orders.filter(
                    (entry) => entry.userId === filter.userId && entry.isDemo === filter.isDemo,
                  ),
              };
            },
          };
        },
      };
    },
  };
  const handler = createAccountOrdersHandler({
    getUserId: (req) => (req as Request & { testUserId?: string }).testUserId,
    getMongoDatabase: async () => {
      databaseCalls += 1;
      return database as unknown as Awaited<ReturnType<typeof getMongoDatabase>>;
    },
  });
  return { handler, queries, get databaseCalls() { return databaseCalls; } };
}

function request(userId?: string): Request {
  return {
    ...(userId ? { testUserId: userId } : {}),
    log: { error() {} },
  } as unknown as Request;
}

test("account order history rejects requests without a signed-in buyer", async () => {
  const fixture = makeHandler([order("guest-order", null)]);
  const { response, result } = responseRecorder();

  await fixture.handler(request(), response);

  assert.equal(result.statusCode, 401);
  assert.deepEqual(result.body, { error: "authentication_required" });
  assert.equal(fixture.databaseCalls, 0);
});

test("account order history returns each signed-in buyer's demo snapshots only", async () => {
  const fixture = makeHandler([
    order("buyer-a-order", "buyer-a"),
    order("buyer-b-order", "buyer-b"),
    order("guest-order", null),
    order("non-demo-order", "buyer-a", false),
  ]);

  const buyerAResponse = responseRecorder();
  await fixture.handler(request("buyer-a"), buyerAResponse.response);
  const buyerBResponse = responseRecorder();
  await fixture.handler(request("buyer-b"), buyerBResponse.response);

  assert.equal(buyerAResponse.result.statusCode, 200);
  assert.deepEqual(
    Object.keys((buyerAResponse.result.body as { orders: Record<string, unknown>[] }).orders[0]).sort(),
    ["id", "isDemo", "items", "orderNumber", "placedAt", "subtotal"],
  );
  assert.deepEqual(
    (buyerAResponse.result.body as { orders: { id: string; isDemo: true }[] }).orders.map(
      ({ id }) => id,
    ),
    ["buyer-a-order"],
  );
  assert.deepEqual(
    (buyerBResponse.result.body as { orders: { id: string; isDemo: true }[] }).orders.map(
      ({ id }) => id,
    ),
    ["buyer-b-order"],
  );
  assert.ok(
    (buyerAResponse.result.body as { orders: { isDemo: true }[] }).orders.every(
      ({ isDemo }) => isDemo,
    ),
  );
  assert.deepEqual(fixture.queries, [
    { userId: "buyer-a", isDemo: true },
    { userId: "buyer-b", isDemo: true },
  ]);
});
