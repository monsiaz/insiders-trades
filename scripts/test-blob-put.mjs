#!/usr/bin/env node
import "dotenv/config";
import { config as loadEnv } from "dotenv";
import { put, head } from "@vercel/blob";
import sharp from "sharp";

loadEnv({ path: new URL("../.env.local", import.meta.url).pathname, override: false });

const token = process.env.BLOB_READ_WRITE_TOKEN;
const url = "https://jgfyfeemh9oaokpn.public.blob.vercel-storage.com/logos/wavestone.webp";

// 1. Download current content
const r = await fetch(url, { cache: "no-store" });
console.log("Before: status=", r.status, "age=", r.headers.get("age"), "size=", (await r.arrayBuffer()).byteLength);

// 2. Rasterize the SVG stored
const r2 = await fetch(url, { cache: "no-store" });
const svgBytes = Buffer.from(await r2.arrayBuffer());
console.log("  is svg?", svgBytes.slice(0, 40).toString());
const webp = await sharp(svgBytes, { density: 300 })
  .resize(400, 400, { fit: "inside", background: { r: 255, g: 255, b: 255, alpha: 0 } })
  .webp({ quality: 90 })
  .toBuffer();
console.log("  new WebP size:", webp.length, "starts:", webp.slice(0, 4).toString());

// 3. Upload
const putResult = await put("logos/wavestone.webp", webp, {
  access: "public",
  token,
  contentType: "image/webp",
  addRandomSuffix: false,
  allowOverwrite: true,
  cacheControlMaxAge: 0, // force CDN revalidation
});
console.log("Put OK:", putResult);

// 4. Check head
const h = await head(putResult.url, { token });
console.log("Head:", h);

// 5. Re-fetch
const r3 = await fetch(url, { cache: "no-store" });
const fresh = Buffer.from(await r3.arrayBuffer());
const isWebp = fresh.slice(0, 4).toString() === "RIFF" && fresh.slice(8, 12).toString() === "WEBP";
console.log("After (CDN): size=", fresh.length, "webp=", isWebp, "age=", r3.headers.get("age"));
