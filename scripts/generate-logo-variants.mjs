// One-time asset build script: generates an optimized WebP + PNG for the
// site logo (nav + footer usages), sized for its actual display footprint
// (max 40px CSS height, ~3x for retina). NOT part of the site's runtime/
// build step (static, no-build Vercel site) — run manually if the source
// logo changes, then commit the generated files in /images/.
import sharp from "sharp";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "images");
const srcPath = path.join(outDir, "ecodomehomes-logo.png");

// Displayed at height:38px (.brand .logo) / height:40px (.logo-chip img).
// 130px covers ~3.25x the larger of the two for crisp retina rendering.
const height = 130;

const meta = await sharp(srcPath).metadata();
console.log(`source: ${meta.width}x${meta.height} ${meta.format}, ${fs.statSync(srcPath).size} bytes`);

const webpBuf = await sharp(srcPath).resize({ height }).webp({ quality: 92, alphaQuality: 100 }).toBuffer();
fs.writeFileSync(path.join(outDir, "ecodomehomes-logo-130.webp"), webpBuf);

const pngBuf = await sharp(srcPath)
  .resize({ height })
  .png({ compressionLevel: 9, palette: true, quality: 90 })
  .toBuffer();
fs.writeFileSync(path.join(outDir, "ecodomehomes-logo-130.png"), pngBuf);

console.log(`webp: ${webpBuf.length} bytes, png: ${pngBuf.length} bytes`);
