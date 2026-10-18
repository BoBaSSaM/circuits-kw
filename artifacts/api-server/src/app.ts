import express, { type ErrorRequestHandler, type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import router from "./routes";
import { logger } from "./lib/logger";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import clerkWebhookRouter from "./routes/clerk-webhook";
import { stripeWebhookHandler } from "./routes/stripe-payments";
import healthRouter from "./routes/health";
import { publicCatalogRouter } from "./routes/catalog";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

app.use(cors({ credentials: true, origin: true }));
app.use("/api/webhooks/clerk", express.raw({ type: "application/json" }), clerkWebhookRouter);
app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), stripeWebhookHandler);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Public catalog and health endpoints must remain usable without Clerk being
// available in the browser or in the API middleware.
app.use("/api", healthRouter);
app.use("/api/catalog", publicCatalogRouter);

app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

app.use("/api", router);

function safeApiError(error: unknown) {
  const record =
    typeof error === "object" && error !== null
      ? (error as Record<string, unknown>)
      : {};
  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Unknown API error";
  const rawStack =
    error instanceof Error
      ? error.stack
      : typeof record.stack === "string"
        ? record.stack
        : undefined;
  const sanitize = (value: string) =>
    value
      .replace(/(mongodb(?:\+srv)?:\/\/)[^\s@]+@/gi, "$1[redacted]@")
      .replace(/((?:password|passwd|pwd|token|secret)\s*[=:]\s*)[^\s&]+/gi, "$1[redacted]");

  return {
    errorName: error instanceof Error ? error.name : "UnknownError",
    errorCode:
      typeof record.code === "string" || typeof record.code === "number"
        ? record.code
        : undefined,
    errorMessage: sanitize(rawMessage),
    errorStack: rawStack ? sanitize(rawStack) : undefined,
  };
}

const apiErrorHandler: ErrorRequestHandler = (error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  const record =
    typeof error === "object" && error !== null
      ? (error as Record<string, unknown>)
      : {};
  const rawStatus = record.statusCode ?? record.status;
  const statusCode =
    typeof rawStatus === "number" && rawStatus >= 400 && rawStatus <= 599
      ? rawStatus
      : 500;
  const requestId =
    req.header("x-vercel-id") ??
    req.header("x-request-id") ??
    (typeof req.id === "string" ? req.id : undefined);
  const errorDetails = safeApiError(error);
  const responseBody = {
    error:
      statusCode === 401
        ? "unauthorized"
        : statusCode === 403
          ? "forbidden"
          : "api_request_failed",
    message:
      statusCode < 500
        ? "You are not authorized to complete this request."
        : "The API request could not be completed.",
    ...(requestId ? { requestId } : {}),
    ...(process.env.NODE_ENV !== "production"
      ? { diagnostic: errorDetails.errorMessage }
      : {}),
  };
  const logFields = {
    method: req.method,
    url: req.originalUrl.split("?")[0],
    statusCode,
    requestId,
    responseBody,
    ...errorDetails,
  };

  console.error("[API] Unhandled Express request error", logFields);
  logger.error(logFields, "Unhandled Express request error");
  res.status(statusCode).json(responseBody);
};

app.use(apiErrorHandler);

export default app;
