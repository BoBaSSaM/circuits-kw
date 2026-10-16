import assert from "node:assert/strict";
import test from "node:test";
import type { Request, Response } from "express";
import type { getMongoDatabase } from "../lib/mongo";
import { createUserCartHandlers } from "./user-carts";

type SavedCart = { _id: string; items: Record<string, unknown>[]; updatedAt: Date };

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

function makeFixture() {
  const carts = new Map<string, SavedCart>();
  let databaseCalls = 0;
  const database = {
    collection(name: string) {
      assert.equal(name, "user_carts");
      return {
        findOne: async ({ _id }: { _id: string }) => carts.get(_id) ?? null,
        updateOne: async (
          { _id }: { _id: string },
          update: { $set: Omit<SavedCart, "_id"> },
          options: { upsert: boolean },
        ) => {
          assert.equal(options.upsert, true);
          carts.set(_id, { _id, ...update.$set });
        },
      };
    },
  };
  const handlers = createUserCartHandlers({
    getUserId: (req) => (req as Request & { testUserId?: string }).testUserId,
    getMongoDatabase: async () => {
      databaseCalls += 1;
      return database as unknown as Awaited<ReturnType<typeof getMongoDatabase>>;
    },
    logError: () => undefined,
  });
  const request = (userId?: string, body?: unknown) =>
    ({
      ...(userId ? { testUserId: userId } : {}),
      body,
    }) as unknown as Request;
  return { handlers, carts, request, get databaseCalls() { return databaseCalls; } };
}

const component = {
  id: "part-1",
  name: "Controller",
  price: 3.25,
  kind: "component",
  sku: "CTRL-001",
  qty: 2,
  priceSource: "catalog",
};

test("saved carts require authentication and do not query storage for guests", async () => {
  const fixture = makeFixture();
  const getResponse = responseRecorder();
  await fixture.handlers.getCart(fixture.request(), getResponse.response);
  assert.equal(getResponse.result.statusCode, 401);
  assert.deepEqual(getResponse.result.body, { error: "authentication_required" });

  const saveResponse = responseRecorder();
  await fixture.handlers.saveCart(fixture.request(undefined, { items: [component] }), saveResponse.response);
  assert.equal(saveResponse.result.statusCode, 401);
  assert.equal(fixture.databaseCalls, 0);
});

test("buyers read and replace only their own saved carts", async () => {
  const fixture = makeFixture();
  const savedResponse = responseRecorder();
  await fixture.handlers.saveCart(
    fixture.request("buyer-a", { items: [component] }),
    savedResponse.response,
  );
  assert.equal(savedResponse.result.statusCode, 200);
  assert.deepEqual(savedResponse.result.body, { items: [component] });

  const buyerAResponse = responseRecorder();
  await fixture.handlers.getCart(fixture.request("buyer-a"), buyerAResponse.response);
  assert.deepEqual(buyerAResponse.result.body, { items: [component] });

  const buyerBResponse = responseRecorder();
  await fixture.handlers.getCart(fixture.request("buyer-b"), buyerBResponse.response);
  assert.deepEqual(buyerBResponse.result.body, { items: [] });

  const replaceResponse = responseRecorder();
  await fixture.handlers.saveCart(
    fixture.request("buyer-a", { items: [] }),
    replaceResponse.response,
  );
  assert.deepEqual(replaceResponse.result.body, { items: [] });
  assert.deepEqual(fixture.carts.get("buyer-a")?.items, []);
  assert.equal(fixture.carts.has("buyer-b"), false);
});

test("cart saves reject malformed lines and strip unrecognized cart metadata", async () => {
  const fixture = makeFixture();
  const malformedResponse = responseRecorder();
  await fixture.handlers.saveCart(
    fixture.request("buyer-a", { items: [{ ...component, qty: 0 }] }),
    malformedResponse.response,
  );
  assert.equal(malformedResponse.result.statusCode, 400);
  assert.deepEqual(malformedResponse.result.body, { error: "invalid_cart" });

  const extraFieldsResponse = responseRecorder();
  await fixture.handlers.saveCart(
    fixture.request("buyer-a", { items: [{ ...component, cartAddOperations: { forged: 999 } }] }),
    extraFieldsResponse.response,
  );
  assert.equal(extraFieldsResponse.result.statusCode, 200);
  assert.deepEqual(fixture.carts.get("buyer-a")?.items, [component]);
});
