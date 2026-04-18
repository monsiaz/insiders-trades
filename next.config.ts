import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config, { isServer }) => {
    if (isServer) {
      // pdfjs-dist uses canvas in browser mode, not needed on server
      config.resolve.alias = {
        ...config.resolve.alias,
        canvas: false,
        encoding: false,
      };
      // Treat pdfjs-dist as external to avoid bundling issues with its ESM files
      config.externals = [...(config.externals || []), "pdfjs-dist"];
    }
    // pdf-parse uses __dirname in a way that breaks with webpack
    config.externals = [...(config.externals || []), "pdf-parse"];
    return config;
  },
};

export default nextConfig;
