import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @faira/ui ships TypeScript source (not a built dist), so Next must run it
  // through its own compile pipeline.
  transpilePackages: ["@faira/ui"],
};

export default nextConfig;
