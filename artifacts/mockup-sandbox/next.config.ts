import type { NextConfig } from "next";

const basePath = (process.env.BASE_PATH || "").replace(/\/$/, "");

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  basePath: basePath === "/" ? "" : basePath,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath === "/" ? "" : basePath,
  },
};

export default nextConfig;
