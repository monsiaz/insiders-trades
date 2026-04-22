#!/usr/bin/env node
/**
 * fix-svg-webp-mismatch.mjs
 *
 * Scans every Company.logoUrl, downloads the bytes, and detects:
 *   - SVG content stored with content-type=image/webp → rasterize to real WebP
 *   - Corrupt / tiny / non-image bytes → flag for re-fetch
 *   - Valid WebP/PNG/JPEG → leave alone
 *
 * For SVG cases, rasterize with `sharp` at 400x400, re-upload to the SAME blob
 * key (so existing URL keeps working), with content-type=image/webp.
 *
 * Usage:
 *   node scripts/fix-svg-webp-mismatch.mjs [--apply] [--concurrency=10] [--slug=foo]
 */

import "dotenv/config";
import { config as loadEnv } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { put } from "@vercel/blob";
import sharp from "sharp";

// Also load .env.local (Next.js convention)
loadEnv({ path: new URL("../.env.local", import.meta.url).pathname, override: false });

const apply = process.argv.includes("--apply");
const slugFilter = process.argv.find((a) => a.startsWith("--slug="))?.split("=")[1] ?? null;
const concurrency = Number(process.argv.find((a) => a.startsWith("--concurrency="))?.split("=")[1] ?? 10);

const prisma = new PrismaClient();
const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
if (!blobToken) throw new Error("BLOB_READ_WRITE_TOKEN missing");

/** Detect format from magic bytes. */
function detectFormat(buf) {
  if (!buf || buf.length < 12) return "empty";
  // Check magic bytes first (raster formats)
  if (buf.slice(0, 4).toString() === "RIFF" && buf.slice(8, 12).toString() === "WEBP") return "webp";
  if (buf.slice(0, 8).toString("hex") === "89504e470d0a1a0a") return "png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.slice(0, 6).toString() === "GIF87a" || buf.slice(0, 6).toString() === "GIF89a") return "gif";
  if (buf[0] === 0x00 && buf[1] === 0x00 && buf[2] === 0x01 && buf[3] === 0x00) return "ico";
  // Text-based: SVG / HTML — scan further into the file
  const head = buf.slice(0, Math.min(buf.length, 1024)).toString("utf8").trim().toLowerCase();
  if (head.includes("<svg")) return "svg";
  if (head.includes("<!doctype html") || head.includes("<html")) return "html";
  return "unknown";
}

/** Extract blob key from a Vercel Blob URL (everything after the host/). */
function blobKey(url) {
  const u = new URL(url);
  return u.pathname.replace(/^\//, "");
}

async function rasterizeSvg(svgBuf) {
  // Some SVGs have huge intrinsic pixel sizes → try high density first, fall back to lower
  const densities = [300, 150, 72];
  let lastErr;
  for (const density of densities) {
    try {
      // 1. Rasterize to a large PNG preserving aspect ratio
      const png = await sharp(svgBuf, { density, limitInputPixels: false })
        .resize(800, 800, { fit: "inside", background: { r: 255, g: 255, b: 255, alpha: 0 } })
        .png()
        .toBuffer();

      // 2. Trim transparent/white whitespace around the content
      let trimmed;
      try {
        trimmed = await sharp(png).trim({ threshold: 10 }).toBuffer();
      } catch {
        trimmed = png; // nothing to trim → keep as is
      }

      // 3. Add ~8% padding for breathing room
      const meta = await sharp(trimmed).metadata();
      const padX = Math.round(meta.width * 0.08);
      const padY = Math.round(meta.height * 0.08);
      const padded = await sharp(trimmed)
        .extend({
          top: padY,
          bottom: padY,
          left: padX,
          right: padX,
          background: { r: 255, g: 255, b: 255, alpha: 0 },
        })
        .webp({ quality: 90, effort: 6 })
        .toBuffer();

      return padded;
    } catch (e) {
      lastErr = e;
      if (!/pixel limit|maximum allowed/i.test(String(e))) throw e;
    }
  }
  throw lastErr;
}

async function reuploadWebp(url, bytes) {
  const key = blobKey(url);
  const result = await put(key, bytes, {
    access: "public",
    token: blobToken,
    contentType: "image/webp",
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 60, // short CDN cache so fixes propagate fast
  });
  return result.url;
}

async function download(url) {
  const r = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 InsidersTradesFixer/1.0" },
    // 10s soft timeout
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

async function processOne(co) {
  const { id, name, slug, logoUrl } = co;
  if (!logoUrl) return { name, slug, status: "no-logo" };
  let bytes;
  try {
    bytes = await download(logoUrl);
  } catch (e) {
    return { name, slug, status: "download-fail", detail: String(e).slice(0, 80) };
  }

  const fmt = detectFormat(bytes);

  // Real webp/png/jpeg → fine, skip
  if (fmt === "webp" || fmt === "png" || fmt === "jpeg" || fmt === "gif") {
    return { name, slug, status: "ok", fmt, size: bytes.length };
  }

  if (fmt === "svg") {
    if (!apply) {
      return { name, slug, status: "would-rasterize", fmt, size: bytes.length };
    }
    try {
      const webp = await rasterizeSvg(bytes);
      const newUrl = await reuploadWebp(logoUrl, webp);
      // URL stays the same (addRandomSuffix:false + same key) but we update record for consistency
      if (newUrl !== logoUrl) {
        await prisma.company.update({ where: { id }, data: { logoUrl: newUrl } });
      }
      return { name, slug, status: "rasterized", fmt: "svg→webp", size: webp.length };
    } catch (e) {
      return { name, slug, status: "rasterize-fail", detail: String(e).slice(0, 100) };
    }
  }

  // HTML / ICO / unknown / empty → clear so the Python vision pipeline can re-fetch cleanly
  if (apply) {
    await prisma.company.update({
      where: { id },
      data: { logoUrl: null, logoSource: null },
    });
  }
  return { name, slug, status: apply ? "cleared" : "would-clear", fmt, size: bytes.length };
}

async function main() {
  const where = { logoUrl: { not: null } };
  if (slugFilter) where.slug = slugFilter;

  const companies = await prisma.company.findMany({
    where,
    select: { id: true, name: true, slug: true, logoUrl: true },
    orderBy: { name: "asc" },
  });

  console.log(`Processing ${companies.length} companies (apply=${apply}, concurrency=${concurrency})`);

  const results = [];
  let idx = 0;
  async function worker() {
    while (idx < companies.length) {
      const co = companies[idx++];
      const r = await processOne(co);
      results.push(r);
      if (r.status !== "ok") {
        console.log(`  ${String(idx).padStart(4)}/${companies.length}  ${r.status.padEnd(18)} ${co.name.slice(0, 40).padEnd(40)}  ${r.detail || r.fmt || ""}`);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));

  const counts = {};
  for (const r of results) counts[r.status] = (counts[r.status] ?? 0) + 1;
  console.log("\n=== Summary ===");
  for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(20)} ${v}`);
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
