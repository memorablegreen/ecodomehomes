#!/usr/bin/env node
// Gives every local <img> its intrinsic width/height, and lazy-loads the ones
// that are not the LCP image.
//
// WHY. 740 of 754 <img> tags declared no dimensions, so the browser could not
// reserve space and the page visibly reflowed as each image arrived. Cumulative
// Layout Shift is a Core Web Vitals metric and a ranking input, and this is the
// whole cause of it here.
//
// The global rule was `img{max-width:100%;display:block}` with no height:auto,
// so width/height attributes alone would have stretched every scaled image.
// This adds height:auto to that rule first. More specific rules that set a real
// height (.hero-img, .img-break img) still win on specificity and are untouched.
//
// Run: node scripts/fix-image-markup.mjs [--check]

import sharp from 'sharp';
import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname, normalize } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const CHECK = process.argv.includes('--check');

const OLD_RULE = 'img{max-width:100%;display:block;}';
const NEW_RULE = 'img{max-width:100%;height:auto;display:block;}';

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (['.git', 'node_modules', 'images', 'docs', 'proposals'].includes(name)) continue;
      walk(p);
    } else if (name.endsWith('.html')) files.push(p);
  }
})(ROOT);

const dims = new Map();
async function sizeOf(abs) {
  if (dims.has(abs)) return dims.get(abs);
  let v = null;
  try { const m = await sharp(abs).metadata(); if (m.width && m.height) v = [m.width, m.height]; }
  catch { /* svg without an intrinsic box, or unreadable */ }
  dims.set(abs, v);
  return v;
}

let addedDims = 0, addedLazy = 0, unlazied = 0, prioritised = 0, changedFiles = 0;

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  let out = src.split(OLD_RULE).join(NEW_RULE);

  // Document order matters: the images at the top of the page are the ones the
  // browser must NOT defer. Lazy-loading an above-the-fold image delays the
  // paint it is supposed to speed up, so the header logo and the lead image
  // stay eager and everything below them is deferred.
  const EAGER_LEAD = 2;
  const ordered = [...out.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
  const eager = new Set(ordered.slice(0, EAGER_LEAD));
  for (const tag of new Set(ordered)) {
    let next = tag;

    // --- intrinsic dimensions ---
    const hasDims = /\swidth=/.test(tag) && /\sheight=/.test(tag);
    const srcAttr = tag.match(/\ssrc="([^"]+)"/);
    if (!hasDims && srcAttr && !/^(https?:|data:)/.test(srcAttr[1])) {
      const rel = srcAttr[1].startsWith('/')
        ? join(ROOT, srcAttr[1])
        : normalize(join(dirname(file), srcAttr[1]));
      if (existsSync(rel)) {
        const wh = await sizeOf(rel);
        if (wh) { next = next.replace(/^<img\b/, `<img width="${wh[0]}" height="${wh[1]}"`); addedDims++; }
      }
    }

    // --- lazy loading, except the images the page is racing to paint ---
    // A wide lead image is the page's LCP candidate: tell the browser so. The
    // home pages already do this via a preload; the other 111 did nothing.
    if (eager.has(tag) && !/fetchpriority=/.test(next) && !/class="logo"/.test(next)) {
      const w = Number((next.match(/\swidth="(\d+)"/) || [])[1] || 0);
      if (w >= 1000) { next = next.replace(/^<img\b/, '<img fetchpriority="high"'); prioritised++; }
    }

    const mustBeEager = eager.has(tag) || /fetchpriority="high"/.test(next);
    if (mustBeEager) {
      if (/\sloading="lazy"/.test(next)) { next = next.replace(/\sloading="lazy"/, ''); unlazied++; }
    } else if (!/\sloading=/.test(next)) {
      next = next.replace(/^<img\b/, '<img loading="lazy"');
      addedLazy++;
    }

    if (next !== tag) out = out.split(tag).join(next);
  }

  if (out !== src) { changedFiles++; if (!CHECK) writeFileSync(file, out); }
}

if (CHECK) {
  if (changedFiles) {
    console.error(`Image markup is stale on ${changedFiles} page(s). Run: node scripts/fix-image-markup.mjs`);
    process.exit(1);
  }
  console.log('Image markup is up to date.');
} else {
  console.log(`${addedDims} width/height pairs added, ${addedLazy} lazy-loaded, ${unlazied} kept eager above the fold, ${prioritised} marked high priority, ${changedFiles} file(s) changed.`);
}
