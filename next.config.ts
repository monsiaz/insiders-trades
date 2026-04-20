import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {},
  serverExternalPackages: ["pdfjs-dist", "pdf-parse", "canvas"],

  images: {
    remotePatterns: [
      // Vercel Blob CDN (self-hosted logos)
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
      // External fallbacks (Clearbit, Google)
      { protocol: "https", hostname: "logo.clearbit.com" },
      { protocol: "https", hostname: "www.google.com", pathname: "/s2/favicons**" },
    ],
  },
};

export default nextConfig;
