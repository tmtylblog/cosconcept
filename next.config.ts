import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["neo4j-driver"],
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
