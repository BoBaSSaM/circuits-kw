import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { getMongoDatabase } from "../lib/mongo";

const router: IRouter = Router();

function sanitize(value: string): string {
  return value
    .replace(/(mongodb(?:\+srv)?:\/\/)[^\s@]+@/gi, "$1[redacted]@")
    .replace(/((?:password|passwd|pwd|token|secret)\s*[=:]\s*)[^\s&]+/gi, "$1[redacted]");
}

router.get("/health", async (req, res) => {
  const requestId =
    req.header("x-vercel-id") ?? req.header("x-request-id") ?? undefined;

  try {
    const database = await getMongoDatabase();
    await database.command({ ping: 1 });
    res.json({ status: "ok", database: "connected" });
  } catch (error) {
    const rawMessage =
      error instanceof Error ? error.message : "Unknown database error";
    const errorMessage = sanitize(rawMessage);
    const rawStack = error instanceof Error ? error.stack : undefined;
    const errorStack = rawStack ? sanitize(rawStack) : undefined;
    const missingMongoUri = /MONGODB_URI.*required/i.test(errorMessage);
    const responseBody = {
      status: "error",
      database: "unavailable",
      error: "database_unavailable",
      message: missingMongoUri
        ? "The database is not configured. Set MONGODB_URI for this deployment."
        : "The database could not be reached.",
      ...(requestId ? { requestId } : {}),
      ...(process.env.NODE_ENV !== "production"
        ? { diagnostic: errorMessage }
        : {}),
    };

    console.error("[API] Database health check failed", {
      method: req.method,
      url: req.originalUrl.split("?")[0],
      statusCode: 503,
      responseBody,
      requestId,
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorMessage,
      errorStack,
    });
    res.status(503).json(responseBody);
  }
});

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

export default router;
