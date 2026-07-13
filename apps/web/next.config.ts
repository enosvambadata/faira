import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    // The partner pitch is a self-contained static document in /public --
    // this gives it a clean shareable URL.
    return [{ source: "/partners", destination: "/partners.html" }];
  },
};

export default nextConfig;
