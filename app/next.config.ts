import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // The console's early URLs, kept alive.
  async redirects() {
    return [
      { source: "/audit", destination: "/reports/audit", permanent: true },
      { source: "/audit/export", destination: "/reports/audit/export", permanent: true },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
