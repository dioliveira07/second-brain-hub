import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  env: {
    HUB_API_URL: process.env.HUB_API_URL || "http://hub-api:8000",
    NEXTAUTH_URL: process.env.NEXTAUTH_URL || "http://localhost:3010",
  },
};

export default nextConfig;
