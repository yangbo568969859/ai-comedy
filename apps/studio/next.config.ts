import { config as loadEnvironment } from "dotenv";
import { resolve } from "node:path";
import type { NextConfig } from "next";

if (process.env.DATABASE_URL === undefined) {
  loadEnvironment({ path: resolve(process.cwd(), "../../.env") });
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["bullmq"],
  transpilePackages: ["@ai-manju/db"],
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default nextConfig;
