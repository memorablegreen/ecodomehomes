#!/usr/bin/env node
// Re-encodes the site's raster images and rewrites the references that change
// extension. Idempotent: running it twice is a no-op.
//
// WHY. The images directory was 22 MB, 18 MB of it actually referenced. Three
// photographs had been saved as PNG (2.4 MB, 2.2 MB, 2.0 MB) and the JPEGs were
// encoded at default quality with no size cap, several at 2400px wide for slots
// that never render wider than ~1200. Page weight is a ranking input and it is
// the one thing on this site nobody had touched.
//
// Deliberately conservative: same filenames wherever the format is unchanged,
// no <picture> wrapping (the layouts use :first-child/:nth-child in places, and
// wrapping an <img> would shift those), and PNGs that genuinely use their alpha
// channel stay PNG.
//
// Run: node scripts/optimize-images.mjs [--dry]

import sharp from 'sharp';
import { readdirSync, readFileSync, writeFileSync, statSync, renameSync, unlinkSync } from 'node:fs';
import { join, extname, basename } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const IMG = join(ROOT, 'images');
const DRY = process.argv.includes('--dry');
const MAX_W = 1920;          // nothing on the site renders wider than this
const JPEG = { quality: 80, mozjpeg: true, progressive: true };

// Files whose bytes are already the output of the hero pipeline.
const SKIP = /-(?:640|960|1280|1920)\.(?:jpg|png|avif|webp)$/i;

// --- which images are actually referenced, and from where -------------------
const htmlFiles = [];
(function walk(dir, rel) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (['.git', 'node_modules', 'images', 'docs'].includes(name)) continue;
      walk(p, rel ? `${rel}/${name}` : name);
    } else if (/\.(html|js|css|xml)$/.test(name)) htmlFiles.push(p);
  }
})(ROOT, '');
const corpus = new Map(htmlFiles.map((f) => [f, readFileSync(f, 'utf8')]));
const referenced = (file) => [...corpus.values()].some((t) => t.includes(file));

// --- photograph, or logo/diagram? -------------------------------------------
// JPEG is right for photographs and wrong for flat-colour graphics, where it
// rings around type and logo edges. Shannon entropy separates them cleanly on
// this set: every photograph here measures above 7.4, every logo and diagram
// below 7.0. A PNG that genuinely uses its alpha channel stays PNG regardless.
const GRAPHIC_ENTROPY = 7.2;
async function keepAsPng(p) {
  const m = await sharp(p).metadata();
  const st = await sharp(p).stats();
  if (st.entropy < GRAPHIC_ENTROPY) return true;
  if (!m.hasAlpha) return false;
  const a = st.channels[st.channels.length - 1];
  return a.min < 250;                       // effectively-opaque alpha is noise
}

const renames = new Map();
let before = 0, after = 0, touched = 0;

for (const name of readdirSync(IMG).sort()) {
  if (!/\.(png|jpe?g)$/i.test(name) || SKIP.test(name)) continue;
  const src = join(IMG, name);
  const size0 = statSync(src).size;
  if (!referenced(name)) { before += size0; after += size0; continue; }

  const meta = await sharp(src).metadata();
  const keepPng = extname(name).toLowerCase() === '.png' && await keepAsPng(src);
  const width = Math.min(meta.width, MAX_W);

  let pipeline = sharp(src);
  if (meta.width > MAX_W) pipeline = pipeline.resize({ width: MAX_W, withoutEnlargement: true });

  let outName, buf;
  if (keepPng) {
    outName = name.replace(/\.png$/i, '.png');
    buf = await pipeline.png({ compressionLevel: 9, effort: 10, palette: true, quality: 90 }).toBuffer();
  } else if (extname(name).toLowerCase() === '.png') {
    outName = basename(name, extname(name)) + '.jpg';     // photo wrongly saved as PNG
    buf = await pipeline.flatten({ background: '#ffffff' }).jpeg(JPEG).toBuffer();
  } else {
    outName = name.replace(/\.jpeg$/i, '.jpg').replace(/\.JPG$/, '.jpg');
    buf = await pipeline.jpeg(JPEG).toBuffer();
  }

  before += size0;
  // Never accept a re-encode that is bigger than what we started with.
  if (outName === name && buf.length >= size0) { after += size0; continue; }
  after += buf.length;
  touched++;
  console.log(`  ${String(Math.round(size0/1024)).padStart(6)}KB -> ${String(Math.round(buf.length/1024)).padStart(6)}KB  ${name}${outName !== name ? '  => ' + outName : ''}`);
  if (DRY) continue;
  writeFileSync(join(IMG, outName), buf);
  if (outName !== name) { unlinkSync(src); renames.set(name, outName); }
}

// --- rewrite references for the files that changed extension ----------------
let edited = 0;
if (!DRY && renames.size) {
  for (const [f, text] of corpus) {
    let out = text;
    for (const [from, to] of renames) out = out.split(from).join(to);
    if (out !== text) { writeFileSync(f, out); edited++; }
  }
}

console.log(`\n${touched} image(s) re-encoded, ${renames.size} renamed, ${edited} file(s) updated.`);
console.log(`images/: ${(before/1e6).toFixed(1)} MB -> ${(after/1e6).toFixed(1)} MB  (${Math.round((1-after/before)*100)}% smaller)`);
