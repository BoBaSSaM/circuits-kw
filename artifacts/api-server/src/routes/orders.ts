import { getAuth } from "@clerk/express";
import {
  CreateAdminOrderBody,
  CreateAdminOrderResponse,
  CreateCheckoutOrderBody,
  CreateCheckoutOrderResponse,
  DeleteAdminOrderParams,
  DeleteAdminOrderResponse,
  GetAdminOrdersResponse,
  GetMyOrdersResponse,
  UpdateAdminOrderBody,
  UpdateAdminOrderParams,
  UpdateAdminOrderResponse,
  type AdminOrder,
  type AccountOrder,
  type CheckoutOrderInput,
  type OrderItem,
  type OrderItemInput,
  type OrderCurrency,
  type OrderStatus,
  type ProductInput,
  type ProjectKitInput,
} from "@workspace/api-zod";
import { randomUUID } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { ObjectId } from "mongodb";
import { convertKwdToCurrency, roundMoneyAmount, USD_PER_KWD } from "@workspace/api-zod";
import { logger } from "../lib/logger";
import { requireDashboardRoles } from "../lib/dashboard-auth";
import { getMongoDatabase } from "../lib/mongo";
import { appendDashboardAudit, getDashboardAuditActor } from "../lib/dashboard-audit";

type ProductDocument = ProductInput & { _id: string; id?: string };
type ProjectKitDocument = ProjectKitInput & {
  _id: string;
  id?: string;
  description?: string;
};

export type OrderDocument = {
  _id: ObjectId;
  orderNumber: string;
  checkoutAttemptId?: string;
  placedAt: Date;
  items: OrderItem[];
  subtotal: number;
  currency?: OrderCurrency;
  exchangeRateKwdToUsd?: number | null;
  status: OrderStatus;
  customer: CheckoutOrderInput["customer"];
  shipping: CheckoutOrderInput["shipping"];
  userId: string | null;
  adminNotes: string | null;
  createdBy: string | null;
  isDemo: boolean;
  paymentStatus?: "not_required" | "pending" | "paid" | "failed" | "expired";
  stripeCheckoutSessionId?: string | null;
  stripePaymentIntentId?: string | null;
  paidAt?: Date | null;
};

export class OrderInputError extends Error {
  constructor(
    readonly errorCode: string,
    readonly statusCode = 400,
  ) {
    super(errorCode);
  }
}

const router: IRouter = Router();

export function roundKwd(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
}

export async function resolveOrderItems(
  items: OrderItemInput[],
  database: Awaited<ReturnType<typeof getMongoDatabase>>,
): Promise<OrderItem[]> {
  const products = database.collection<ProductDocument>("products");
  const kits = database.collection<ProjectKitDocument>("project_kits");
  const resolved: OrderItem[] = [];

  for (const item of items) {
    const sku = item.sku.trim().toUpperCase();
    if (item.kind === "kit") {
      const kit = await kits.findOne({
        isActive: { $ne: false },
        $or: [{ _id: item.id }, { id: item.id }, { code: sku }],
      });
      if (!kit) {
        throw new OrderInputError("catalog_item_unavailable");
      }

      resolved.push({
        id: kit.id ?? kit._id,
        kind: "kit",
        sku: kit.code,
        name: kit.title,
        price: roundKwd(kit.price),
        qty: item.qty,
      });
      continue;
    }

    const product = await products.findOne({
      isActive: { $ne: false },
      $or: [{ _id: item.id }, { id: item.id }, { sku }],
    });
    if (!product) {
      throw new OrderInputError("catalog_item_unavailable");
    }

    const price =
      item.kind === "bom" && item.estimateUnitPrice !== undefined
        ? item.estimateUnitPrice
        : product.price;
    if (!Number.isFinite(price) || price < 0) {
      throw new OrderInputError("invalid_catalog_price", 409);
    }

    resolved.push({
      id: product.id ?? product._id,
      kind: item.kind,
      sku: product.sku,
      name: product.name,
      price: roundKwd(price),
      qty: item.qty,
    });
  }

  return resolved;
}

export async function storeOrder(
  input: CheckoutOrderInput,
  options: {
    userId: string | null;
    createdBy: string | null;
    checkoutAttemptId?: string;
  },
  getDatabase: typeof getMongoDatabase = getMongoDatabase,
): Promise<{ order: AdminOrder; replayed: boolean }> {
  const database = await getDatabase();
  const orders = database.collection<OrderDocument>("orders");
  const existingOrder = options.checkoutAttemptId
    ? await orders.findOne({ checkoutAttemptId: options.checkoutAttemptId })
    : null;
  if (existingOrder) {
    if (existingOrder.userId !== options.userId) {
      throw new OrderInputError("checkout_attempt_conflict", 409);
    }
    return { order: toAdminOrder(existingOrder), replayed: true };
  }

  const currency: OrderCurrency = "USD";
  const items = (await resolveOrderItems(input.items, database)).map((item) => ({
    ...item,
    price: convertKwdToCurrency(item.price, currency),
  }));
  const subtotal = roundMoneyAmount(
    items.reduce((total, item) => total + item.price * item.qty, 0),
    currency,
  );
  const placedAt = new Date();
  const orderNumber = `CKW-${Date.now()}-${randomUUID().slice(0, 6).toUpperCase()}`;
  const document: OrderDocument = {
    _id: new ObjectId(),
    orderNumber,
    ...(options.checkoutAttemptId
      ? { checkoutAttemptId: options.checkoutAttemptId }
      : {}),
    placedAt,
    items,
    subtotal,
    currency,
    exchangeRateKwdToUsd: currency === "USD" ? USD_PER_KWD : null,
    status: "new",
    customer: input.customer,
    shipping: input.shipping,
    userId: options.userId,
    adminNotes: null,
    createdBy: options.createdBy,
    isDemo: true,
    paymentStatus: "not_required",
  };

  try {
    await orders.insertOne(document);
  } catch (error) {
    if (!isDuplicateKeyError(error) || !options.checkoutAttemptId) throw error;
    const concurrentlySavedOrder = await orders.findOne({
      checkoutAttemptId: options.checkoutAttemptId,
    });
    if (!concurrentlySavedOrder) throw error;
    if (concurrentlySavedOrder.userId !== options.userId) {
      throw new OrderInputError("checkout_attempt_conflict", 409);
    }
    return { order: toAdminOrder(concurrentlySavedOrder), replayed: true };
  }

  return { order: toAdminOrder(document), replayed: false };
}

function respondToOrderError(error: unknown, res: Response): void {
  if (error instanceof OrderInputError) {
    res.status(error.statusCode).json({ error: error.errorCode });
    return;
  }
  if (isDuplicateKeyError(error)) {
    res.status(409).json({ error: "order_number_conflict" });
    return;
  }

  logger.error(
    { errorName: error instanceof Error ? error.name : "UnknownError" },
    "Could not save order in MongoDB",
  );
  res.status(503).json({ error: "order_storage_unavailable" });
}

function toAdminOrder(document: OrderDocument): AdminOrder {
  return {
    id: document._id.toHexString(),
    orderNumber: document.orderNumber,
    placedAt: document.placedAt,
    items: document.items,
    subtotal: document.subtotal,
    currency: document.currency ?? "KWD",
    exchangeRateKwdToUsd: document.exchangeRateKwdToUsd ?? null,
    status: document.status,
    customer: document.customer,
    shipping: document.shipping,
    userId: document.userId,
    adminNotes: document.adminNotes,
    isDemo: document.isDemo ?? true,
    paymentStatus: document.paymentStatus ?? "not_required",
  };
}

function toAccountOrder(document: OrderDocument): AccountOrder {
  return {
    id: document._id.toHexString(),
    orderNumber: document.orderNumber,
    placedAt: document.placedAt,
    items: document.items,
    subtotal: document.subtotal,
    currency: document.currency ?? "KWD",
    exchangeRateKwdToUsd: document.exchangeRateKwdToUsd ?? null,
    isDemo: document.isDemo ?? true,
    paymentStatus: document.paymentStatus ?? "not_required",
  };
}

type AccountOrdersDependencies = {
  getUserId: (req: Request) => string | null | undefined;
  getMongoDatabase: typeof getMongoDatabase;
};

export function createAccountOrdersHandler({
  getUserId,
  getMongoDatabase,
}: AccountOrdersDependencies) {
  return async (req: Request, res: Response): Promise<void> => {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: "authentication_required" });
      return;
    }

    try {
      const database = await getMongoDatabase();
      const documents = await database
        .collection<OrderDocument>("orders")
        .find({ userId })
        .sort({ placedAt: -1 })
        .toArray();
      res.json(
        GetMyOrdersResponse.parse({
          orders: documents.map(toAccountOrder),
        }),
      );
    } catch (error) {
      req.log.error(
        { errorName: error instanceof Error ? error.name : "UnknownError" },
        "Could not load the signed-in buyer's demo orders",
      );
      res.status(503).json({ error: "orders_unavailable" });
    }
  };
}

router.get(
  "/orders",
  createAccountOrdersHandler({
    getUserId: (req) => getAuth(req).userId,
    getMongoDatabase,
  }),
);

type CheckoutOrderHandlerDependencies = {
  getUserId: (req: Request) => string | null | undefined;
  getMongoDatabase: typeof getMongoDatabase;
};

export function createCheckoutOrderHandler({
  getUserId,
  getMongoDatabase: getDatabase,
}: CheckoutOrderHandlerDependencies) {
  return async (req: Request, res: Response): Promise<void> => {
    const parsed = CreateCheckoutOrderBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_order", details: parsed.error.issues });
      return;
    }

    try {
      const { order, replayed } = await storeOrder(
        parsed.data,
        {
          userId: getUserId(req) ?? null,
          createdBy: null,
          checkoutAttemptId: parsed.data.checkoutAttemptId,
        },
        getDatabase,
      );
      res.status(replayed ? 200 : 201).json(
        CreateCheckoutOrderResponse.parse({
          id: order.id,
          orderNumber: order.orderNumber,
          placedAt: order.placedAt,
          items: order.items,
          subtotal: order.subtotal,
          currency: order.currency ?? "KWD",
          exchangeRateKwdToUsd: order.exchangeRateKwdToUsd ?? null,
          status: order.status,
          isDemo: order.isDemo,
          paymentStatus: order.paymentStatus,
        }),
      );
    } catch (error) {
      respondToOrderError(error, res);
    }
  };
}

router.post(
  "/orders",
  createCheckoutOrderHandler({
    getUserId: (req) => getAuth(req).userId,
    getMongoDatabase,
  }),
);

router.get(
  "/admin/orders",
  requireDashboardRoles("admin", "editor"),
  async (_req, res) => {
    try {
      const database = await getMongoDatabase();
      const documents = await database
        .collection<OrderDocument>("orders")
        .find()
        .sort({ placedAt: -1 })
        .toArray();
      res.json(GetAdminOrdersResponse.parse({ orders: documents.map(toAdminOrder) }));
    } catch (error) {
      logger.error(
        { errorName: error instanceof Error ? error.name : "UnknownError" },
        "Could not load saved orders",
      );
      res.status(503).json({ error: "orders_unavailable" });
    }
  },
);

router.post(
  "/admin/orders",
  requireDashboardRoles("admin", "editor"),
  async (req, res) => {
    const parsed = CreateAdminOrderBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_order", details: parsed.error.issues });
      return;
    }

    try {
      const { userId } = getAuth(req);
      const { order } = await storeOrder(parsed.data, {
        userId: null,
        createdBy: userId ?? null,
      });
      const database = await getMongoDatabase();
      await appendDashboardAudit(database, {
        ...getDashboardAuditActor(res.locals.dashboardProfile),
        action: "created",
        recordType: "order",
        recordId: order.id,
        before: null,
        after: { status: order.status, adminNotePresent: false },
      });
      res.status(201).json(CreateAdminOrderResponse.parse(order));
    } catch (error) {
      respondToOrderError(error, res);
    }
  },
);

router.patch(
  "/admin/orders/:id",
  requireDashboardRoles("admin", "editor"),
  async (req, res) => {
    const params = UpdateAdminOrderParams.safeParse(req.params);
    const parsed = UpdateAdminOrderBody.safeParse(req.body);
    if (!params.success || !parsed.success) {
      res.status(400).json({
        error: "invalid_order_update",
        details: [
          ...(params.success ? [] : params.error.issues),
          ...(parsed.success ? [] : parsed.error.issues),
        ],
      });
      return;
    }
    if (!ObjectId.isValid(params.data.id)) {
      res.status(400).json({ error: "invalid_order_id" });
      return;
    }

    try {
      const database = await getMongoDatabase();
      const orders = database.collection<OrderDocument>("orders");
      const orderId = new ObjectId(params.data.id);
      const before = await orders.findOne({ _id: orderId });
      if (!before) {
        res.status(404).json({ error: "order_not_found" });
        return;
      }
      const result = await orders.updateOne(
        { _id: orderId },
        { $set: { status: parsed.data.status, adminNotes: parsed.data.adminNotes } },
      );
      if (!result.matchedCount) {
        res.status(404).json({ error: "order_not_found" });
        return;
      }
      const document = await orders.findOne({ _id: orderId });
      if (!document) {
        res.status(404).json({ error: "order_not_found" });
        return;
      }
      await appendDashboardAudit(database, {
        ...getDashboardAuditActor(res.locals.dashboardProfile),
        action: "updated",
        recordType: "order",
        recordId: params.data.id,
        before: {
          status: before.status,
          adminNotePresent: Boolean(before.adminNotes),
        },
        after: {
          status: document.status,
          adminNotePresent: Boolean(document.adminNotes),
        },
      });
      res.json(UpdateAdminOrderResponse.parse(toAdminOrder(document)));
    } catch (error) {
      logger.error(
        { errorName: error instanceof Error ? error.name : "UnknownError" },
        "Could not update saved order",
      );
      res.status(503).json({ error: "order_update_failed" });
    }
  },
);

router.delete(
  "/admin/orders/:id",
  requireDashboardRoles("admin", "editor"),
  async (req, res) => {
    const params = DeleteAdminOrderParams.safeParse(req.params);
    if (!params.success || !ObjectId.isValid(params.data.id)) {
      res.status(400).json({ error: "invalid_order_id" });
      return;
    }

    try {
      const database = await getMongoDatabase();
      const orders = database.collection<OrderDocument>("orders");
      const orderId = new ObjectId(params.data.id);
      const before = await orders.findOne({ _id: orderId });
      if (!before) {
        res.status(404).json({ error: "order_not_found" });
        return;
      }
      const result = await orders.deleteOne({ _id: orderId });
      if (!result.deletedCount) {
        res.status(404).json({ error: "order_not_found" });
        return;
      }
      await appendDashboardAudit(database, {
        ...getDashboardAuditActor(res.locals.dashboardProfile),
        action: "deleted",
        recordType: "order",
        recordId: params.data.id,
        before: {
          status: before.status,
          adminNotePresent: Boolean(before.adminNotes),
        },
        after: null,
      });
      res.json(DeleteAdminOrderResponse.parse({ deleted: true }));
    } catch (error) {
      logger.error(
        { errorName: error instanceof Error ? error.name : "UnknownError" },
        "Could not delete saved order",
      );
      res.status(503).json({ error: "order_delete_failed" });
    }
  },
);

export default router;
