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
  trailingSlash: true,

  // Compress static assets via Next.js (gzip/brotli on applicable routes)
  compress: true,

  turbopack: {},
  serverExternalPackages: ["pdfjs-dist", "pdf-parse", "canvas"],

  // Reduce logs in production
  logging: { fetches: { fullUrl: false } },

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
    // Explicit whitelist — the old hostname:"**" wildcard allowed any domain through
    // the image optimizer (security risk + cost). Only allow known logo sources.
    remotePatterns: [
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
      { protocol: "https", hostname: "public.blob.vercel-storage.com" },
      { protocol: "https", hostname: "logo.clearbit.com" },
      { protocol: "https", hostname: "www.google.com", pathname: "/s2/favicons**" },
      // Yahoo Finance chart images
      { protocol: "https", hostname: "*.yahoo.com" },
      // Favicon CDN used in CompanyBadge
      { protocol: "https", hostname: "icons.duckduckgo.com" },
      { protocol: "https", hostname: "www.gstatic.com" },
    ],
  },
};

export default nextConfig;
