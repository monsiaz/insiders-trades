import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {},
  serverExternalPackages: ["pdfjs-dist", "pdf-parse", "canvas"],

  images: {
    // Logos are already WebP on Blob — no need for Next.js re-optimization
    formats: ["image/webp", "image/avif"],
    minimumCacheTTL: 86400, // cache logos 24h
    remotePatterns: [
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
      { protocol: "https", hostname: "logo.clearbit.com" },
      { protocol: "https", hostname: "www.google.com", pathname: "/s2/favicons**" },
      // OG images from company websites
      { protocol: "https", hostname: "**" },
    ],
  },
};

export default nextConfig;
