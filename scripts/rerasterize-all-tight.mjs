#!/usr/bin/env node
/**
 * rerasterize-all-tight.mjs
 *
 * Iterates through every Company.logoUrl, downloads the stored WebP,
 * trims transparent/white whitespace, adds breathing-room padding,
 * and re-uploads. This ensures wordmark logos look their best in
 * small avatar containers.
 *
 * Skips files where trim changes nothing (already tight).
 *
 * Usage:
 *   node scripts/rerasterize-all-tight.mjs [--apply] [--slug=X] [--concurrency=10]
 */

import "dotenv/config";
import { config as loadEnv } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { put } from "@vercel/blob";
import sharp from "sharp";

loadEnv({ path: new URL("../.env.local", import.meta.url).pathname, override: false });

const apply = process.argv.includes("--apply");
const slugFilter = process.argv.find((a) => a.startsWith("--slug="))?.split("=")[1] ?? null;
const concurrency = Number(process.argv.find((a) => a.startsWith("--concurrency="))?.split("=")[1] ?? 10);
const token = process.env.BLOB_READ_WRITE_TOKEN;
if (!token) throw new Error("BLOB_READ_WRITE_TOKEN missing");

const prisma = new PrismaClient();

function blobKey(url) { return new URL(url).pathname.replace(/^\//, ""); }

async function tighten(buf) {
  const meta0 = await sharp(buf).metadata();
  let trimmed;
  try {
    trimmed = await sharp(buf).trim({ threshold: 10 }).toBuffer();
  } catch {
    trimmed = buf;
  }
  const meta1 = await sharp(trimmed).metadata();
  const padX = Math.max(2, Math.round(meta1.width * 0.08));
  const padY = Math.max(2, Math.round(meta1.height * 0.08));
  const padded = await sharp(trimmed)
    .extend({
      top: padY, bottom: padY, left: padX, right: padX,
      background: { r: 255, g: 255, b: 255, alpha: 0 },
    })
    .webp({ quality: 90, effort: 6 })
    .toBuffer();
  const meta2 = await sharp(padded).metadata();
  return {
    bytes: padded,
    before: `${meta0.width}x${meta0.height}`,
    after: `${meta2.width}x${meta2.height}`,
    aspectBefore: meta0.width / Math.max(1, meta0.height),
    aspectAfter: meta2.width / Math.max(1, meta2.height),
  };
}

async function processOne(co) {
  const { id, name, slug, logoUrl } = co;
  try {
    const r = await fetch(logoUrl, { cache: "no-store" });
    if (!r.ok) return { name, slug, status: "download-fail" };
    const buf = Buffer.from(await r.arrayBuffer());

    // Detect format
    const head = buf.slice(0, 32).toString().toLowerCase();
    const isSvg = head.includes("<svg") || head.includes("<?xml");
    const isWebp = buf.slice(0, 4).toString() === "RIFF" && buf.slice(8, 12).toString() === "WEBP";

    if (!isWebp && !isSvg) {
      return { name, slug, status: "skip-unknown-format" };
    }

    let sourceBuf = buf;
    if (isSvg) {
      // Rasterize from SVG first
      try {
        sourceBuf = await sharp(buf, { density: 300, limitInputPixels: false })
          .resize(800, 800, { fit: "inside", background: { r: 255, g: 255, b: 255, alpha: 0 } })
          .png()
          .toBuffer();
      } catch {
        try {
          sourceBuf = await sharp(buf, { density: 150, limitInputPixels: false })
            .resize(800, 800, { fit: "inside", background: { r: 255, g: 255, b: 255, alpha: 0 } })
            .png()
            .toBuffer();
        } catch (e) {
          return { name, slug, status: "rasterize-fail", detail: String(e).slice(0, 80) };
        }
      }
    }

    const result = await tighten(sourceBuf);

    // Skip if already tight (aspect change < 3% AND size diff < 5%)
    const aspectChange = Math.abs(result.aspectAfter - result.aspectBefore) / Math.max(0.01, result.aspectBefore);
    if (!isSvg && aspectChange < 0.03 && Math.abs(result.bytes.length - buf.length) / buf.length < 0.05) {
      return { name, slug, status: "already-tight", before: result.before };
    }

    if (!apply) {
      return {
        name, slug, status: "would-tighten",
        before: result.before, after: result.after,
        aspect: result.aspectAfter.toFixed(2),
      };
    }

    const key = blobKey(logoUrl);
    const up = await put(key, result.bytes, {
      access: "public",
      token,
      contentType: "image/webp",
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 60,
    });
    if (up.url !== logoUrl) {
      await prisma.company.update({ where: { id }, data: { logoUrl: up.url } });
    }
    return {
      name, slug, status: "tightened",
      before: result.before, after: result.after,
      aspect: result.aspectAfter.toFixed(2),
    };
  } catch (e) {
    return { name, slug, status: "error", detail: String(e).slice(0, 120) };
  }
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

  const counts = {};
  let idx = 0;
  async function worker() {
    while (idx < companies.length) {
      const co = companies[idx++];
      const r = await processOne(co);
      counts[r.status] = (counts[r.status] ?? 0) + 1;
      if (r.status !== "already-tight" && r.status !== "skip-unknown-format") {
        const detail = r.before ? `${r.before} → ${r.after} (${r.aspect})` : (r.detail || "");
        console.log(`  ${String(idx).padStart(4)}/${companies.length} ${r.status.padEnd(22)} ${r.name.slice(0,38).padEnd(38)} ${detail}`);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));

  console.log("\n=== Summary ===");
  for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(24)} ${v}`);
  }
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
