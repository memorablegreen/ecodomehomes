// One-time asset build script: generates responsive AVIF/WebP/JPEG variants
// of the homepage hero LCP image. NOT part of the site's runtime/build step
// (this is a static, no-build Vercel site) — run manually when the source
// hero image changes, then commit the generated files in /images/.
import sharp from "sharp";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "images");
const base = "passive-modern-J8h8NqjXL4KGvEeH";
const srcPath = path.join(outDir, `${base}.jpg`);
const widths = [640, 960, 1280, 1920];

const meta = await sharp(srcPath).metadata();
console.log(`source: ${meta.width}x${meta.height} ${meta.format}, ${fs.statSync(srcPath).size} bytes`);

const results = [];

for (const w of widths) {
  const avifPath = path.join(outDir, `${base}-${w}.avif`);
  const avifBuf = await sharp(srcPath).resize({ width: w }).avif({ quality: 65, effort: 4 }).toBuffer();
  fs.writeFileSync(avifPath, avifBuf);

  const webpPath = path.join(outDir, `${base}-${w}.webp`);
  const webpBuf = await sharp(srcPath).resize({ width: w }).webp({ quality: 75 }).toBuffer();
  fs.writeFileSync(webpPath, webpBuf);

  const jpgPath = path.join(outDir, `${base}-${w}.jpg`);
  const jpgBuf = await sharp(srcPath)
    .resize({ width: w })
    .jpeg({ quality: 78, mozjpeg: true, progressive: true })
    .toBuffer();
  fs.writeFileSync(jpgPath, jpgBuf);

  results.push({ width: w, avif: avifBuf.length, webp: webpBuf.length, jpg: jpgBuf.length });
}

console.table(results);
