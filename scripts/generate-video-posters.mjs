// One-time asset build script: generates a small poster-sized JPEG for the
// "Coastal" reel video (the only video poster without an existing small
// variant \u2014 the other three reuse passive-modern-*-640.jpg from
// generate-hero-variants.mjs). <video poster> is fetched eagerly by the
// browser regardless of the preload attribute, so it must be pre-sized or
// it competes with LCP on mobile. NOT part of the site's runtime/build step
// (static, no-build Vercel site) \u2014 run manually if the source photo
// changes, then commit the generated file in /images/.
import sharp from "sharp";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "images");
const base = "carrribean-paradise-3ZBhyT6VjMh3FRQc";
const srcPath = path.join(outDir, `${base}.jpg`);

const meta = await sharp(srcPath).metadata();
console.log(`source: ${meta.width}x${meta.height} ${meta.format}, ${fs.statSync(srcPath).size} bytes`);

const buf = await sharp(srcPath)
  .resize({ width: 640 })
  .jpeg({ quality: 78, mozjpeg: true, progressive: true })
  .toBuffer();
fs.writeFileSync(path.join(outDir, `${base}-640.jpg`), buf);

console.log(`poster: ${buf.length} bytes`);
