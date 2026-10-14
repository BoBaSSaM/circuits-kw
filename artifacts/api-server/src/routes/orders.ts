import { getAuth } from "@clerk/express";
import {
  CreateAdminOrderBody,
  CreateAdminOrderResponse,
  CreateCheckoutOrderBody,
  CreateCheckoutOrderResponse,
  DeleteAdminOrderParams,
  DeleteAdminOrderResponse,
  GetAdminOrdersResponse,
  UpdateAdminOrderBody,
  UpdateAdminOrderParams,
  UpdateAdminOrderResponse,
  type AdminOrder,
  type CheckoutOrderInput,
  type OrderItem,
  type OrderItemInput,
  type OrderStatus,
  type ProductInput,
  type ProjectKitInput,
} from "@workspace/api-zod";
import { randomUUID } from "node:crypto";
import { Router, type IRouter, type Response } from "express";
import { ObjectId } from "mongodb";
import { logger } from "../lib/logger";
import { requireDashboardRoles } from "../lib/dashboard-auth";
import { getMongoDatabase } from "../lib/mongo";

type ProductDocument = ProductInput & { _id: string; id?: string };
type ProjectKitDocument = ProjectKitInput & {
  _id: string;
  id?: string;
  description?: string;
};

type OrderDocument = {
  _id: ObjectId;
  orderNumber: string;
  placedAt: Date;
  items: OrderItem[];
  subtotal: number;
  status: OrderStatus;
  customer: CheckoutOrderInput["customer"];
  shipping: CheckoutOrderInput["shipping"];
  userId: string | null;
  adminNotes: string | null;
  createdBy: string | null;
  isDemo: true;
};

class OrderInputError extends Error {
  constructor(
    readonly errorCode: string,
    readonly statusCode = 400,
  ) {
    super(errorCode);
  }
}

const router: IRouter = Router();

function roundKwd(value: number): number {
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

async function resolveOrderItems(items: OrderItemInput[]): Promise<OrderItem[]> {
  const database = await getMongoDatabase();
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

async function storeOrder(
  input: CheckoutOrderInput,
  options: { userId: string | null; createdBy: string | null },
): Promise<AdminOrder> {
  const database = await getMongoDatabase();
  const items = await resolveOrderItems(input.items);
  const subtotal = roundKwd(items.reduce((total, item) => total + item.price * item.qty, 0));
  const placedAt = new Date();
  const orderNumber = `CKW-${Date.now()}-${randomUUID().slice(0, 6).toUpperCase()}`;
  const document: OrderDocument = {
    _id: new ObjectId(),
    orderNumber,
    placedAt,
    items,
    subtotal,
    status: "new",
    customer: input.customer,
    shipping: input.shipping,
    userId: options.userId,
    adminNotes: null,
    createdBy: options.createdBy,
    isDemo: true,
  };

  await database.collection<OrderDocument>("orders").insertOne(document);
  return {
    id: document._id.toHexString(),
    orderNumber: document.orderNumber,
    placedAt: document.placedAt,
    items: document.items,
    subtotal: document.subtotal,
    status: document.status,
    customer: document.customer,
    shipping: document.shipping,
    userId: document.userId,
    adminNotes: document.adminNotes,
  };
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
    status: document.status,
    customer: document.customer,
    shipping: document.shipping,
    userId: document.userId,
    adminNotes: document.adminNotes,
  };
}

router.post("/orders", async (req, res) => {
  const parsed = CreateCheckoutOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_order", details: parsed.error.issues });
    return;
  }

  try {
    const { userId } = getAuth(req);
    const order = await storeOrder(parsed.data, { userId: userId ?? null, createdBy: null });
    res.status(201).json(
      CreateCheckoutOrderResponse.parse({
        id: order.id,
        orderNumber: order.orderNumber,
        placedAt: order.placedAt,
        items: order.items,
        subtotal: order.subtotal,
        status: order.status,
      }),
    );
  } catch (error) {
    respondToOrderError(error, res);
  }
});

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
      const order = await storeOrder(parsed.data, {
        userId: null,
        createdBy: userId ?? null,
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
      const result = await orders.updateOne(
        { _id: new ObjectId(params.data.id) },
        { $set: { status: parsed.data.status, adminNotes: parsed.data.adminNotes } },
      );
      if (!result.matchedCount) {
        res.status(404).json({ error: "order_not_found" });
        return;
      }
      const document = await orders.findOne({ _id: new ObjectId(params.data.id) });
      if (!document) {
        res.status(404).json({ error: "order_not_found" });
        return;
      }
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
      const result = await database
        .collection<OrderDocument>("orders")
        .deleteOne({ _id: new ObjectId(params.data.id) });
      if (!result.deletedCount) {
        res.status(404).json({ error: "order_not_found" });
        return;
      }
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
