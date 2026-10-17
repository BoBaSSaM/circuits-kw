import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import express from "express";
import { ObjectId } from "mongodb";
import { mock, test } from "node:test";

type Document = Record<string, any>;

const collections: Record<string, Document[]> = {
  products: [],
  project_kits: [],
  orders: [],
  users: [
    {
      _id: "target-user",
      clerkUserId: "clerk-target-user",
      email: "private-target@example.com",
      firstName: "Target",
      lastName: "User",
      role: "customer",
      passwordHash: "private-auth-hash",
      sessionToken: "private-session-token",
    },
  ],
  dashboard_audit: [],
};

function sameValue(left: unknown, right: unknown): boolean {
  if (left instanceof ObjectId) return left.toHexString() === String(right);
  if (right instanceof ObjectId) return right.toHexString() === String(left);
  return left === right;
}

function matches(document: Document, filter: Document): boolean {
  return Object.entries(filter).every(([key, expected]) => {
    if (key === "$or") {
      return (expected as Document[]).some((candidate) => matches(document, candidate));
    }
    if (expected && typeof expected === "object") {
      if ("$ne" in expected && sameValue(document[key], expected.$ne)) return false;
      if ("$regex" in expected) {
        const options = String(expected.$options ?? "");
        if (!new RegExp(String(expected.$regex), options).test(String(document[key] ?? ""))) {
          return false;
        }
      }
      const actual = document[key] instanceof Date
        ? (document[key] as Date).getTime()
        : document[key];
      if ("$gte" in expected) {
        const lower = expected.$gte instanceof Date ? expected.$gte.getTime() : expected.$gte;
        if ((actual as number) < (lower as number)) return false;
      }
      if ("$lt" in expected) {
        const upper = expected.$lt instanceof Date ? expected.$lt.getTime() : expected.$lt;
        if ((actual as number) >= (upper as number)) return false;
      }
    }
    return expected && typeof expected === "object" &&
      ("$ne" in expected || "$regex" in expected || "$gte" in expected || "$lt" in expected)
      ? true
      : sameValue(document[key], expected);
  });
}

const database = {
  collection(name: string) {
    const documents = collections[name];
    assert.ok(documents, `Unexpected collection: ${name}`);
    return {
      async insertOne(document: Document) {
        documents.push(document);
        return { insertedId: document._id };
      },
      async findOne(filter: Document) {
        const document = documents.find((entry) => matches(entry, filter));
        return document ? { ...document } : null;
      },
      async updateOne(filter: Document, update: { $set: Document }) {
        const document = documents.find((entry) => matches(entry, filter));
        if (!document) return { matchedCount: 0, modifiedCount: 0 };
        Object.assign(document, update.$set);
        return { matchedCount: 1, modifiedCount: 1 };
      },
      async deleteOne(filter: Document) {
        const index = documents.findIndex((entry) => matches(entry, filter));
        if (index < 0) return { deletedCount: 0 };
        documents.splice(index, 1);
        return { deletedCount: 1 };
      },
      async countDocuments(filter: Document) {
        return documents.filter((document) => matches(document, filter)).length;
      },
      find(filter: Document = {}) {
        let result = documents.filter((document) => matches(document, filter));
        const cursor = {
          sort(sortFields: Record<string, 1 | -1>) {
            const [[field, direction]] = Object.entries(sortFields);
            result = [...result].sort((left, right) => {
              const a = left[field] instanceof Date ? left[field].getTime() : left[field];
              const b = right[field] instanceof Date ? right[field].getTime() : right[field];
              return (a < b ? -1 : a > b ? 1 : 0) * direction;
            });
            return cursor;
          },
          limit(count: number) {
            result = result.slice(0, count);
            return cursor;
          },
          skip(count: number) {
            result = result.slice(count);
            return cursor;
          },
          async toArray() {
            return result;
          },
        };
        return cursor;
      },
    };
  },
};

const profiles: Record<string, Document> = {
  "editor-user": {
    _id: "editor-user",
    clerkUserId: "editor-user",
    firstName: "Ed",
    lastName: "Itor",
    email: "private-editor@example.com",
    role: "editor",
    passwordHash: "private-profile-hash",
    sessionToken: "private-profile-token",
  },
  "admin-user": {
    _id: "admin-user",
    clerkUserId: "admin-user",
    firstName: "Ada",
    lastName: "Admin",
    email: "private-admin@example.com",
    role: "admin",
    passwordHash: "private-admin-hash",
    sessionToken: "private-admin-token",
  },
  "customer-user": {
    _id: "customer-user",
    clerkUserId: "customer-user",
    firstName: "Casey",
    lastName: "Customer",
    email: "private-customer@example.com",
    role: "customer",
  },
};

function jsonBody(value: unknown): string {
  return JSON.stringify(value);
}

async function request(
  baseUrl: string,
  path: string,
  options: { method?: string; userId?: string; body?: unknown } = {},
) {
  return fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers: {
      ...(options.userId ? { "x-test-user-id": options.userId } : {}),
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(options.body === undefined ? {} : { body: jsonBody(options.body) }),
  });
}

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return `http://127.0.0.1:${address.port}`;
}

test("dashboard audit history records safe changes and is admin-only", async (t) => {
  mock.module("../lib/mongo", {
    namedExports: { getMongoDatabase: async () => database },
  });
  mock.module("@clerk/express", {
    namedExports: {
      getAuth: (req: { headers: Record<string, string | string[] | undefined> }) => ({
        userId: req.headers["x-test-user-id"] ?? null,
      }),
    },
  });
  mock.module("../lib/user-profiles", {
    namedExports: {
      getOrSyncUserProfile: async (userId: string) => profiles[userId],
      normalizeDashboardRole: (role: string | null | undefined) => role ?? "customer",
      isBootstrapAdmin: () => false,
    },
  });

  const [{ default: catalogRouter }, { default: ordersRouter }, { default: adminRouter }] =
    await Promise.all([import("./catalog"), import("./orders"), import("./admin")]);
  const app = express();
  app.use(express.json());
  app.use(catalogRouter, ordersRouter, adminRouter);
  const server = createServer(app);
  const baseUrl = await listen(server);
  t.after(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    mock.restoreAll();
  });

  const productInput = {
    name: "Audit Test Product",
    sku: "AUDIT-PRODUCT",
    category: "Test",
    price: 3.5,
    stock: 12,
    package: "Box",
    description: "A safe product description.",
    voltage: "5V",
    interface: "I2C",
    icon: "cpu",
    imageUrl: null,
    isActive: true,
  };
  const kitInput = {
    code: "AUDIT-KIT",
    title: "Audit Test Kit",
    category: "Test",
    level: "Beginner",
    domain: "Electronics",
    duration: "2 hours",
    price: 8.75,
    desc: "A safe kit description.",
    parts: ["resistor", "sensor"],
    count: "2 parts",
    manual: "Safe setup steps.",
    icon: "robot",
    isActive: true,
  };

  const createdProductResponse = await request(baseUrl, "/admin/products", {
    method: "POST",
    userId: "editor-user",
    body: productInput,
  });
  assert.equal(createdProductResponse.status, 201);
  const createdProduct = (await createdProductResponse.json()) as { id: string };
  const updatedProductResponse = await request(
    baseUrl,
    `/admin/products/${createdProduct.id}`,
    {
      method: "PUT",
      userId: "editor-user",
      body: { ...productInput, name: "Updated Audit Product", price: 4.25 },
    },
  );
  assert.equal(updatedProductResponse.status, 200);
  assert.equal(
    (
      await request(baseUrl, `/admin/products/${createdProduct.id}`, {
        method: "DELETE",
        userId: "editor-user",
      })
    ).status,
    200,
  );

  const createdKitResponse = await request(baseUrl, "/admin/project-kits", {
    method: "POST",
    userId: "editor-user",
    body: kitInput,
  });
  assert.equal(createdKitResponse.status, 201);
  const createdKit = (await createdKitResponse.json()) as { id: string };
  const updatedKitResponse = await request(
    baseUrl,
    `/admin/project-kits/${createdKit.id}`,
    {
      method: "PUT",
      userId: "editor-user",
      body: { ...kitInput, title: "Updated Audit Kit", price: 9.5 },
    },
  );
  assert.equal(updatedKitResponse.status, 200);
  assert.equal(
    (
      await request(baseUrl, `/admin/project-kits/${createdKit.id}`, {
        method: "DELETE",
        userId: "editor-user",
      })
    ).status,
    200,
  );

  // Re-add a purchasable catalog item so dashboard order creation resolves a real item.
  const orderProductResponse = await request(baseUrl, "/admin/products", {
    method: "POST",
    userId: "editor-user",
    body: { ...productInput, sku: "ORDER-PRODUCT" },
  });
  assert.equal(orderProductResponse.status, 201);
  const orderProduct = (await orderProductResponse.json()) as { id: string };
  const createdOrderResponse = await request(baseUrl, "/admin/orders", {
    method: "POST",
    userId: "editor-user",
    body: {
      customer: {
        name: "Private Customer Name",
        email: "private-order@example.com",
        phone: "+965 5555 1234",
      },
      shipping: {
        governorate: "Capital",
        area: "Kuwait City",
        block: "1",
        street: "Private Customer Street",
        building: "10",
        notes: "PRIVATE_SHIPPING_NOTE",
      },
      items: [{ id: orderProduct.id, kind: "component", sku: "ORDER-PRODUCT", qty: 1 }],
    },
  });
  assert.equal(createdOrderResponse.status, 201);
  const createdOrder = (await createdOrderResponse.json()) as { id: string };
  assert.equal(
    (
      await request(baseUrl, `/admin/orders/${createdOrder.id}`, {
        method: "PATCH",
        userId: "editor-user",
        body: { status: "confirmed", adminNotes: "PRIVATE_INTERNAL_NOTE" },
      })
    ).status,
    200,
  );

  assert.equal(
    (
      await request(baseUrl, "/admin/users/target-user", {
        method: "PATCH",
        userId: "admin-user",
        body: { role: "editor" },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request(baseUrl, `/admin/orders/${createdOrder.id}`, {
        method: "DELETE",
        userId: "editor-user",
      })
    ).status,
    200,
  );

  const auditEntries = collections.dashboard_audit;
  const expected = [
    {
      action: "created",
      recordType: "product",
      recordId: createdProduct.id,
      before: null,
      after: { name: "Audit Test Product", sku: "AUDIT-PRODUCT", price: 3.5, stock: 12, isActive: true },
    },
    {
      action: "updated",
      recordType: "product",
      recordId: createdProduct.id,
      before: { name: "Audit Test Product", sku: "AUDIT-PRODUCT", price: 3.5, stock: 12, isActive: true },
      after: { name: "Updated Audit Product", sku: "AUDIT-PRODUCT", price: 4.25, stock: 12, isActive: true },
    },
    {
      action: "deleted",
      recordType: "product",
      recordId: createdProduct.id,
      before: { name: "Updated Audit Product", sku: "AUDIT-PRODUCT", price: 4.25, stock: 12, isActive: true },
      after: null,
    },
    {
      action: "created",
      recordType: "project_kit",
      recordId: createdKit.id,
      before: null,
      after: { title: "Audit Test Kit", code: "AUDIT-KIT", price: 8.75, isActive: true },
    },
    {
      action: "updated",
      recordType: "project_kit",
      recordId: createdKit.id,
      before: { title: "Audit Test Kit", code: "AUDIT-KIT", price: 8.75, isActive: true },
      after: { title: "Updated Audit Kit", code: "AUDIT-KIT", price: 9.5, isActive: true },
    },
    {
      action: "deleted",
      recordType: "project_kit",
      recordId: createdKit.id,
      before: { title: "Updated Audit Kit", code: "AUDIT-KIT", price: 9.5, isActive: true },
      after: null,
    },
    {
      action: "created",
      recordType: "product",
      recordId: orderProduct.id,
      before: null,
      after: { name: "Audit Test Product", sku: "ORDER-PRODUCT", price: 3.5, stock: 12, isActive: true },
    },
    {
      action: "created",
      recordType: "order",
      recordId: createdOrder.id,
      before: null,
      after: { status: "new", adminNotePresent: false },
    },
    {
      action: "updated",
      recordType: "order",
      recordId: createdOrder.id,
      before: { status: "new", adminNotePresent: false },
      after: { status: "confirmed", adminNotePresent: true },
    },
    {
      action: "updated",
      recordType: "user",
      recordId: "clerk-target-user",
      before: { role: "customer" },
      after: { role: "editor" },
    },
    {
      action: "deleted",
      recordType: "order",
      recordId: createdOrder.id,
      before: { status: "confirmed", adminNotePresent: true },
      after: null,
    },
  ];
  assert.equal(auditEntries.length, expected.length);
  for (const [index, expectedEntry] of expected.entries()) {
    const entry = auditEntries[index];
    assert.equal(entry.actorId, expectedEntry.recordType === "user" ? "admin-user" : "editor-user");
    assert.equal(entry.actorName, expectedEntry.recordType === "user" ? "Ada Admin" : "Ed Itor");
    assert.equal(entry.actorRole, expectedEntry.recordType === "user" ? "admin" : "editor");
    assert.equal(entry.action, expectedEntry.action);
    assert.equal(entry.recordType, expectedEntry.recordType);
    assert.equal(entry.recordId, expectedEntry.recordId);
    assert.ok(entry.timestamp instanceof Date);
    assert.ok(entry.timestamp.getTime() <= Date.now());
    assert.ok(entry.timestamp.getTime() >= Date.now() - 60_000);
    assert.deepEqual(entry.before, expectedEntry.before);
    assert.deepEqual(entry.after, expectedEntry.after);
  }

  const serializedAudit = JSON.stringify(auditEntries);
  for (const privateValue of [
    "private-order@example.com",
    "+965 5555 1234",
    "Private Customer Name",
    "Private Customer Street",
    "PRIVATE_SHIPPING_NOTE",
    "PRIVATE_INTERNAL_NOTE",
    "private-target@example.com",
    "private-auth-hash",
    "private-session-token",
    "private-profile-hash",
    "private-profile-token",
    "private-admin-hash",
    "private-admin-token",
  ]) {
    assert.ok(!serializedAudit.includes(privateValue), `Audit leaked ${privateValue}`);
  }

  const signedOutAudit = await request(baseUrl, "/admin/audit-log");
  assert.equal(signedOutAudit.status, 401);
  const editorAudit = await request(baseUrl, "/admin/audit-log", { userId: "editor-user" });
  assert.equal(editorAudit.status, 403);
  const customerAudit = await request(baseUrl, "/admin/audit-log", { userId: "customer-user" });
  assert.equal(customerAudit.status, 403);

  const adminAuditResponse = await request(baseUrl, "/admin/audit-log", {
    userId: "admin-user",
  });
  assert.equal(adminAuditResponse.status, 200);
  const adminAudit = (await adminAuditResponse.json()) as {
    entries: Document[];
  };
  assert.equal(adminAudit.entries.length, expected.length);
  assert.deepEqual(
    adminAudit.entries[0],
    {
      id: auditEntries.at(-1)._id,
      actorId: "editor-user",
      actorName: "Ed Itor",
      actorRole: "editor",
      action: "deleted",
      recordType: "order",
      recordId: createdOrder.id,
      timestamp: auditEntries.at(-1).timestamp.toISOString(),
      before: { status: "confirmed", adminNotePresent: true },
      after: null,
    },
  );
  const serializedResponse = JSON.stringify(adminAudit);
  for (const privateValue of [
    "private-order@example.com",
    "PRIVATE_SHIPPING_NOTE",
    "PRIVATE_INTERNAL_NOTE",
    "private-target@example.com",
    "private-auth-hash",
    "private-session-token",
  ]) {
    assert.ok(!serializedResponse.includes(privateValue), `Audit response leaked ${privateValue}`);
  }

  for (let index = 0; index < 110; index += 1) {
    collections.dashboard_audit.push({
      _id: `archive-entry-${index}`,
      actorId: "archive-admin",
      actorName: "Archive Reviewer",
      actorRole: "admin",
      action: "updated",
      recordType: index % 2 === 0 ? "product" : "order",
      recordId: `archive-record-${index}`,
      timestamp: new Date(Date.now() - (index + 1) * 24 * 60 * 60 * 1000),
      before: null,
      after: null,
    });
  }

  const laterAuditPageResponse = await request(
    baseUrl,
    "/admin/audit-log?page=5&pageSize=25",
    { userId: "admin-user" },
  );
  assert.equal(laterAuditPageResponse.status, 200);
  const laterAuditPage = (await laterAuditPageResponse.json()) as Document;
  assert.equal(laterAuditPage.page, 5);
  assert.equal(laterAuditPage.pageSize, 25);
  assert.equal(laterAuditPage.total, expected.length + 110);
  assert.equal(laterAuditPage.entries.length, 21);
  assert.ok(
    new Date(laterAuditPage.entries[0].timestamp).getTime() <
      Date.now() - 80 * 24 * 60 * 60 * 1000,
    "Later pages should include changes older than the previous 100-entry window",
  );

  const filteredAuditResponse = await request(
    baseUrl,
    "/admin/audit-log?page=1&pageSize=100&actor=archive&recordType=product",
    { userId: "admin-user" },
  );
  assert.equal(filteredAuditResponse.status, 200);
  const filteredAudit = (await filteredAuditResponse.json()) as Document;
  assert.equal(filteredAudit.total, 55);
  assert.ok(filteredAudit.entries.every((entry: Document) =>
    entry.actorId === "archive-admin" && entry.recordType === "product"));

  const actorNameAuditResponse = await request(
    baseUrl,
    "/admin/audit-log?actor=ARCHIVE%20REVIEWER&pageSize=100",
    { userId: "admin-user" },
  );
  assert.equal(actorNameAuditResponse.status, 200);
  assert.equal(((await actorNameAuditResponse.json()) as Document).total, 110);

  const archiveDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const dateFilteredAuditResponse = await request(
    baseUrl,
    `/admin/audit-log?actor=archive-admin&from=${archiveDate}&to=${archiveDate}`,
    { userId: "admin-user" },
  );
  assert.equal(dateFilteredAuditResponse.status, 200);
  const dateFilteredAudit = (await dateFilteredAuditResponse.json()) as Document;
  assert.equal(dateFilteredAudit.total, 1);
  assert.equal(dateFilteredAudit.entries[0].recordId, "archive-record-0");

  for (const invalidQuery of [
    "?page=0",
    "?pageSize=101",
    "?recordType=unknown",
    "?from=2026-02-30",
    "?from=2026-02-02&to=2026-02-01",
    `?actor=${"a".repeat(101)}`,
  ]) {
    assert.equal(
      (await request(baseUrl, `/admin/audit-log${invalidQuery}`, { userId: "admin-user" })).status,
      400,
      `Expected invalid query ${invalidQuery} to be rejected`,
    );
  }

  for (const path of [
    "/admin/audit-log?page=2&pageSize=25",
    "/admin/audit-log?actor=archive&recordType=product",
    `/admin/audit-log?from=${archiveDate}&to=${archiveDate}`,
  ]) {
    assert.equal(
      (await request(baseUrl, path, { userId: "editor-user" })).status,
      403,
      "Audit filtering and paging must remain admin-only",
    );
  }
});
