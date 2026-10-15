import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const workspaceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const nextConfig: NextConfig = {
  outputFileTracingRoot: workspaceRoot,
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  distDir: process.env.NEXT_DIST_DIR || ".next",
  env: {
    NEXT_PUBLIC_BASE_PATH: process.env.BASE_PATH || "",
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
      process.env.VITE_CLERK_PUBLISHABLE_KEY ||
      process.env.CLERK_PUBLISHABLE_KEY ||
      "",
    NEXT_PUBLIC_CLERK_PROXY_URL:
      process.env.NEXT_PUBLIC_CLERK_PROXY_URL ||
      process.env.VITE_CLERK_PROXY_URL ||
      "",
  },
  transpilePackages: [
    "@workspace/api-client-react",
    "@workspace/api-server",
    "@workspace/api-zod",
    "@workspace/db",
  ],
  serverExternalPackages: [
    "@clerk/express",
    "express",
    "http-proxy-middleware",
    "mongodb",
    "pino",
    "pino-http",
    "serverless-http",
  ],
};

export default nextConfig;
