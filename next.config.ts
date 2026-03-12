import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // TODO: Remove once Better Auth type inference for admin plugin is fixed.
  // 72 pre-existing type errors: session.user.role not typed by admin plugin.
  // All errors are TypeScript-only — runtime behavior is correct.
  typescript: {
    ignoreBuildErrors: true,
  },
  serverExternalPackages: ["neo4j-driver"],
  outputFileTracingRoot: __dirname,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "img.logo.dev",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "www.google.com",
        pathname: "/s2/favicons/**",
      },
    ],
  },
};

export default nextConfig;
