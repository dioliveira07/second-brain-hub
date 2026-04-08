import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  basePath: "/painel",
  env: {
    NEXTAUTH_URL: process.env.NEXTAUTH_URL || "http://localhost:3010",
  },
  transpilePackages: ["@antv/g6", "@antv/graphlib", "@antv/layout", "@antv/g6-extension-3d"],
  serverExternalPackages: ["canvas"],
};

export default nextConfig;
