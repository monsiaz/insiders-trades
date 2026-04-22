import type { NextConfig } from "next";

const securityHeaders = [
  // Anti-clickjacking
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  // Disable MIME sniffing
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Referrer policy
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // HSTS (2 years, includeSubDomains)
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // Permissions policy — disable sensors/camera etc
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  // XSS protection (legacy browsers)
  { key: "X-XSS-Protection", value: "1; mode=block" },
];

const nextConfig: NextConfig = {
  turbopack: {},
  serverExternalPackages: ["pdfjs-dist", "pdf-parse", "canvas"],

  async headers() {
    return [
      // Security headers on all routes
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
      // Cache public images / fonts / icons
      {
        source: "/(.*)\\.(webp|png|jpg|jpeg|svg|ico|woff2|woff)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, stale-while-revalidate=86400, immutable",
          },
        ],
      },
      // Default: authenticated API routes must not be cached publicly
      {
        source: "/api/v1/(.*)",
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
        ],
      },
    ];
  },

  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 86400,
    remotePatterns: [
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
      { protocol: "https", hostname: "logo.clearbit.com" },
      { protocol: "https", hostname: "www.google.com", pathname: "/s2/favicons**" },
      { protocol: "https", hostname: "**" },
    ],
  },
};

export default nextConfig;
