import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["music-metadata", "xlsx"],
  experimental: {
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },
};

export default nextConfig;
