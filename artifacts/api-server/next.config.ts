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
  transpilePackages: ["@workspace/api-zod", "@workspace/db"],
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
