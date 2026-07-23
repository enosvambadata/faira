import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @faira/ui ships TypeScript source (not a built dist), so Next must run it
  // through its own compile pipeline.
  transpilePackages: ["@faira/ui"],
  async rewrites() {
    // The Vamba Collect partner pitch is a self-contained static document in
    // /public -- this gives it a clean shareable URL.
    return [{ source: "/partners", destination: "/partners.html" }];
  },
};

export default nextConfig;
