import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const workspaceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const basePath = (process.env.BASE_PATH || "").replace(/\/$/, "");

const nextConfig: NextConfig = {
  outputFileTracingRoot: workspaceRoot,
  turbopack: { root: workspaceRoot },
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  basePath: basePath === "/" ? "" : basePath,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath === "/" ? "" : basePath,
  },
};

export default nextConfig;
