import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Empty turbopack config tells Next.js 16 to use Turbopack (default)
  // without complaining about webpack-only config
  turbopack: {},

  serverExternalPackages: ["pdfjs-dist", "pdf-parse", "canvas"],
};

export default nextConfig;
