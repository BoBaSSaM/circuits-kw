import {
  CreateProductBody,
  CreateProductResponse,
  CreateProjectKitBody,
  CreateProjectKitResponse,
  DeleteProductParams,
  DeleteProductResponse,
  DeleteProjectKitParams,
  DeleteProjectKitResponse,
  GetAdminCatalogResponse,
  GetCatalogResponse,
  UpdateProductBody,
  UpdateProductParams,
  UpdateProductResponse,
  UpdateProjectKitBody,
  UpdateProjectKitParams,
  UpdateProjectKitResponse,
  type ProductInput,
  type ProjectKitInput,
} from "@workspace/api-zod";
import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";
import { requireDashboardRoles } from "../lib/dashboard-auth";
import { getMongoDatabase } from "../lib/mongo";
import { appendDashboardAudit, getDashboardAuditActor } from "../lib/dashboard-audit";

type ProductDocument = ProductInput & {
  _id: string;
  id?: string;
  createdAt?: Date;
  updatedAt?: Date;
  seedSource?: string;
  isDemo?: boolean;
};

type ProjectKitDocument = ProjectKitInput & {
  _id: string;
  id?: string;
  description?: string;
  itemCountLabel?: string;
  manualNotes?: string;
  createdAt?: Date;
  updatedAt?: Date;
  seedSource?: string;
  isDemo?: boolean;
};

const router: IRouter = Router();

function normalizeProduct(document: ProductDocument) {
  return {
    id: document.id ?? document._id,
    name: document.name,
    sku: document.sku,
    category: document.category,
    price: document.price,
    stock: document.stock,
    package: document.package,
    description: document.description,
    voltage: document.voltage,
    interface: document.interface,
    icon: document.icon,
    imageUrl: document.imageUrl ?? null,
    isActive: document.isActive !== false,
  };
}

function normalizeKit(document: ProjectKitDocument) {
  return {
    id: document.id ?? document._id,
    code: document.code,
    title: document.title,
    category: document.category,
    level: document.level,
    domain: document.domain,
    duration: document.duration,
    price: document.price,
    desc: document.desc ?? document.description ?? "",
    parts: document.parts ?? [],
    count: document.count ?? document.itemCountLabel ?? "",
    manual: document.manual ?? document.manualNotes ?? "",
    icon: document.icon,
    isActive: document.isActive !== false,
  };
}

function normalizeProductInput(input: ProductInput): ProductInput {
  return {
    ...input,
    name: input.name.trim(),
    sku: input.sku.trim().toUpperCase(),
    category: input.category.trim(),
    package: input.package.trim(),
    description: input.description.trim(),
    voltage: input.voltage.trim(),
    interface: input.interface.trim(),
    imageUrl: input.imageUrl?.trim() || null,
  };
}

function normalizeKitInput(input: ProjectKitInput): ProjectKitInput {
  return {
    ...input,
    code: input.code.trim().toUpperCase(),
    title: input.title.trim(),
    category: input.category.trim(),
    domain: input.domain.trim(),
    duration: input.duration.trim(),
    desc: input.desc.trim(),
    parts: input.parts.map((part) => part.trim()).filter(Boolean),
    count: input.count.trim(),
    manual: input.manual.trim(),
  };
}

function productAuditDetails(product: ProductDocument) {
  return {
    name: product.name,
    sku: product.sku,
    price: product.price,
    stock: product.stock,
    isActive: product.isActive !== false,
  };
}

function kitAuditDetails(kit: ProjectKitDocument) {
  return {
    title: kit.title,
    code: kit.code,
    price: kit.price,
    isActive: kit.isActive !== false,
  };
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
}

function respondToCatalogError(
  error: unknown,
  res: Parameters<Parameters<IRouter["get"]>[1]>[1],
  operation: string,
): void {
  if (isDuplicateKeyError(error)) {
    res.status(409).json({ error: "sku_or_code_already_exists" });
    return;
  }

  logger.error(
    { errorName: error instanceof Error ? error.name : "UnknownError" },
    operation,
  );
  res.status(500).json({ error: "catalog_operation_failed" });
}

function getCatalogFailureDetails(error: unknown) {
  const record =
    typeof error === "object" && error !== null
      ? (error as Record<string, unknown>)
      : {};
  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Unknown catalog error";
  const message = rawMessage
    .replace(/(mongodb(?:\+srv)?:\/\/)[^\s@]+@/gi, "$1[redacted]@")
    .replace(/((?:password|passwd|pwd|token|secret)\s*[=:]\s*)[^\s&]+/gi, "$1[redacted]");
  const code =
    typeof record.code === "string" || typeof record.code === "number"
      ? record.code
      : undefined;

  return {
    errorName: error instanceof Error ? error.name : "UnknownError",
    errorCode: code,
    errorMessage: message,
  };
}

router.get("/catalog", async (_req, res) => {
  try {
    const database = await getMongoDatabase();
    const [products, kits] = await Promise.all([
      database
        .collection<ProductDocument>("products")
        .find({ isActive: { $ne: false } })
        .sort({ name: 1 })
        .toArray(),
      database
        .collection<ProjectKitDocument>("project_kits")
        .find({ isActive: { $ne: false } })
        .sort({ title: 1 })
        .toArray(),
    ]);
    res.json(
      GetCatalogResponse.parse({
        products: products.map(normalizeProduct),
        kits: kits.map(normalizeKit),
      }),
    );
  } catch (error) {
    const details = getCatalogFailureDetails(error);
    const requestId =
      _req.header("x-vercel-id") ?? _req.header("x-request-id") ?? undefined;
    const missingMongoUri = /MONGODB_URI.*required/i.test(details.errorMessage);
    const responseBody = {
      error: "catalog_unavailable",
      message: missingMongoUri
        ? "The catalog database is not configured. Set MONGODB_URI for this deployment."
        : "The catalog database could not be reached. Check the MongoDB connection and deployment logs.",
      ...(requestId ? { requestId } : {}),
      ...(process.env.NODE_ENV !== "production"
        ? { diagnostic: details.errorMessage }
        : {}),
    };

    logger.error(
      {
        method: _req.method,
        url: _req.originalUrl,
        statusCode: 503,
        responseBody,
        requestId,
        ...details,
      },
      "Could not load public catalog from MongoDB",
    );
    res.status(503).json(responseBody);
  }
});

router.get(
  "/admin/catalog",
  requireDashboardRoles("admin", "editor"),
  async (_req, res) => {
    try {
      const database = await getMongoDatabase();
      const [products, kits] = await Promise.all([
        database.collection<ProductDocument>("products").find().sort({ name: 1 }).toArray(),
        database
          .collection<ProjectKitDocument>("project_kits")
          .find()
          .sort({ title: 1 })
          .toArray(),
      ]);
      res.json(
        GetAdminCatalogResponse.parse({
          products: products.map(normalizeProduct),
          kits: kits.map(normalizeKit),
        }),
      );
    } catch (error) {
      logger.error(
        { errorName: error instanceof Error ? error.name : "UnknownError" },
        "Could not load admin catalog from MongoDB",
      );
      res.status(503).json({ error: "catalog_unavailable" });
    }
  },
);

router.post(
  "/admin/products",
  requireDashboardRoles("admin", "editor"),
  async (req, res) => {
    const parsed = CreateProductBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_product", details: parsed.error.issues });
      return;
    }

    try {
      const database = await getMongoDatabase();
      const id = randomUUID();
      const now = new Date();
      const input = normalizeProductInput(parsed.data);
      const document: ProductDocument = {
        _id: id,
        id,
        ...input,
        createdAt: now,
        updatedAt: now,
        isDemo: false,
      };
      await database.collection<ProductDocument>("products").insertOne(document);
      await appendDashboardAudit(database, {
        ...getDashboardAuditActor(res.locals.dashboardProfile),
        action: "created",
        recordType: "product",
        recordId: id,
        before: null,
        after: productAuditDetails(document),
      });
      res.status(201).json(CreateProductResponse.parse(normalizeProduct(document)));
    } catch (error) {
      respondToCatalogError(error, res, "Could not create catalog product");
    }
  },
);

router.put(
  "/admin/products/:id",
  requireDashboardRoles("admin", "editor"),
  async (req, res) => {
    const params = UpdateProductParams.safeParse(req.params);
    const parsed = UpdateProductBody.safeParse(req.body);
    if (!params.success || !parsed.success) {
      res.status(400).json({
        error: "invalid_product",
        details: [
          ...(params.success ? [] : params.error.issues),
          ...(parsed.success ? [] : parsed.error.issues),
        ],
      });
      return;
    }

    try {
      const database = await getMongoDatabase();
      const products = database.collection<ProductDocument>("products");
      const selector = { $or: [{ _id: params.data.id }, { id: params.data.id }] };
      const before = await products.findOne(selector);
      if (!before) {
        res.status(404).json({ error: "product_not_found" });
        return;
      }
      const input = normalizeProductInput(parsed.data);
      const result = await products.updateOne(
        selector,
        { $set: { ...input, updatedAt: new Date() } },
      );
      if (!result.matchedCount) {
        res.status(404).json({ error: "product_not_found" });
        return;
      }

      const document = await products.findOne(selector);
      if (!document) {
        res.status(404).json({ error: "product_not_found" });
        return;
      }
      await appendDashboardAudit(database, {
        ...getDashboardAuditActor(res.locals.dashboardProfile),
        action: "updated",
        recordType: "product",
        recordId: params.data.id,
        before: productAuditDetails(before),
        after: productAuditDetails(document),
      });
      res.json(UpdateProductResponse.parse(normalizeProduct(document)));
    } catch (error) {
      respondToCatalogError(error, res, "Could not update catalog product");
    }
  },
);

router.delete(
  "/admin/products/:id",
  requireDashboardRoles("admin", "editor"),
  async (req, res) => {
    const params = DeleteProductParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "invalid_product_id" });
      return;
    }

    try {
      const database = await getMongoDatabase();
      const products = database.collection<ProductDocument>("products");
      const selector = { $or: [{ _id: params.data.id }, { id: params.data.id }] };
      const before = await products.findOne(selector);
      if (!before) {
        res.status(404).json({ error: "product_not_found" });
        return;
      }
      const result = await products.deleteOne(selector);
      if (!result.deletedCount) {
        res.status(404).json({ error: "product_not_found" });
        return;
      }
      await appendDashboardAudit(database, {
        ...getDashboardAuditActor(res.locals.dashboardProfile),
        action: "deleted",
        recordType: "product",
        recordId: params.data.id,
        before: productAuditDetails(before),
        after: null,
      });
      res.json(DeleteProductResponse.parse({ deleted: true }));
    } catch (error) {
      respondToCatalogError(error, res, "Could not delete catalog product");
    }
  },
);

router.post(
  "/admin/project-kits",
  requireDashboardRoles("admin", "editor"),
  async (req, res) => {
    const parsed = CreateProjectKitBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_project_kit", details: parsed.error.issues });
      return;
    }

    try {
      const database = await getMongoDatabase();
      const id = randomUUID();
      const now = new Date();
      const input = normalizeKitInput(parsed.data);
      const document: ProjectKitDocument = {
        _id: id,
        id,
        ...input,
        createdAt: now,
        updatedAt: now,
        isDemo: false,
      };
      await database.collection<ProjectKitDocument>("project_kits").insertOne(document);
      await appendDashboardAudit(database, {
        ...getDashboardAuditActor(res.locals.dashboardProfile),
        action: "created",
        recordType: "project_kit",
        recordId: id,
        before: null,
        after: kitAuditDetails(document),
      });
      res.status(201).json(CreateProjectKitResponse.parse(normalizeKit(document)));
    } catch (error) {
      respondToCatalogError(error, res, "Could not create project kit");
    }
  },
);

router.put(
  "/admin/project-kits/:id",
  requireDashboardRoles("admin", "editor"),
  async (req, res) => {
    const params = UpdateProjectKitParams.safeParse(req.params);
    const parsed = UpdateProjectKitBody.safeParse(req.body);
    if (!params.success || !parsed.success) {
      res.status(400).json({
        error: "invalid_project_kit",
        details: [
          ...(params.success ? [] : params.error.issues),
          ...(parsed.success ? [] : parsed.error.issues),
        ],
      });
      return;
    }

    try {
      const database = await getMongoDatabase();
      const kits = database.collection<ProjectKitDocument>("project_kits");
      const selector = { $or: [{ _id: params.data.id }, { id: params.data.id }] };
      const before = await kits.findOne(selector);
      if (!before) {
        res.status(404).json({ error: "project_kit_not_found" });
        return;
      }
      const input = normalizeKitInput(parsed.data);
      const result = await kits.updateOne(
        selector,
        { $set: { ...input, updatedAt: new Date() } },
      );
      if (!result.matchedCount) {
        res.status(404).json({ error: "project_kit_not_found" });
        return;
      }

      const document = await kits.findOne(selector);
      if (!document) {
        res.status(404).json({ error: "project_kit_not_found" });
        return;
      }
      await appendDashboardAudit(database, {
        ...getDashboardAuditActor(res.locals.dashboardProfile),
        action: "updated",
        recordType: "project_kit",
        recordId: params.data.id,
        before: kitAuditDetails(before),
        after: kitAuditDetails(document),
      });
      res.json(UpdateProjectKitResponse.parse(normalizeKit(document)));
    } catch (error) {
      respondToCatalogError(error, res, "Could not update project kit");
    }
  },
);

router.delete(
  "/admin/project-kits/:id",
  requireDashboardRoles("admin", "editor"),
  async (req, res) => {
    const params = DeleteProjectKitParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "invalid_project_kit_id" });
      return;
    }

    try {
      const database = await getMongoDatabase();
      const kits = database.collection<ProjectKitDocument>("project_kits");
      const selector = { $or: [{ _id: params.data.id }, { id: params.data.id }] };
      const before = await kits.findOne(selector);
      if (!before) {
        res.status(404).json({ error: "project_kit_not_found" });
        return;
      }
      const result = await kits.deleteOne(selector);
      if (!result.deletedCount) {
        res.status(404).json({ error: "project_kit_not_found" });
        return;
      }
      await appendDashboardAudit(database, {
        ...getDashboardAuditActor(res.locals.dashboardProfile),
        action: "deleted",
        recordType: "project_kit",
        recordId: params.data.id,
        before: kitAuditDetails(before),
        after: null,
      });
      res.json(DeleteProjectKitResponse.parse({ deleted: true }));
    } catch (error) {
      respondToCatalogError(error, res, "Could not delete project kit");
    }
  },
);

export default router;
