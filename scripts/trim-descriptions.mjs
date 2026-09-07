#!/usr/bin/env node
// Trims over-long meta descriptions back to whole sentences under the length
// search engines actually display.
//
// WHY. 52 of 118 descriptions ran past 165 characters, up to 248. Google shows
// roughly the first 155-160 and drops the rest, so the tail was never reaching
// anyone; the translations overflowed because Romance and Germanic copy runs
// 20-30% longer than the English it was translated from.
//
// Trims by dropping whole trailing sentences, never mid-sentence, so the lead
// (which is the part that gets shown) is untouched and what remains still reads
// as finished prose. Abbreviations are guarded: a naive split turns "el Prof.
// Oliveira aporta..." into a description ending "el Prof."
//
// Run: node scripts/trim-descriptions.mjs [--check|--dry]

import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const LIMIT = 158;
// Trimming to whole sentences can overshoot: /de/pricing's first sentence is
// "Interaktives Preistool." A 23-character description is worse than an
// over-long one, so a trim is only taken if what survives is still substantial.
const FLOOR = 90;
const MODE = process.argv.find((a) => a.startsWith('--')) || '';

// Descriptions that are a single long sentence cannot be trimmed by dropping a
// clause boundary, so those are shortened by hand, in their own language, in
// scripts/data/descriptions.json and applied from there.
const OVERRIDES = JSON.parse(readFileSync(join(ROOT, 'scripts/data/descriptions.json'), 'utf8'));

// Titles and honorifics that end in a period without ending a sentence.
const ABBREV = /(?:^|\s)(?:Prof|Dr|Mr|Mrs|Ms|Sr|Sra|Srta|St|Ing|Dipl|Univ|Inc|Ltd|Lda|Nr|No|vs|z\.B|u\.a|bzw|ca|etc|Jr|Ph\.D|M\.Sc|B\.Sc|[A-ZÀ-Ý])\.$/;

function trim(text) {
  if (text.length <= LIMIT) return text;
  // Candidate sentence ends, ignoring the ones that are really abbreviations.
  const ends = [];
  for (const m of text.matchAll(/[.!?](?=\s|$)/g)) {
    const upto = text.slice(0, m.index + 1);
    if (!ABBREV.test(upto)) ends.push(m.index + 1);
  }
  const fit = ends.filter((e) => e <= LIMIT).pop();
  if (!fit) return text;                           // no clean sentence break
  const cut = text.slice(0, fit).trim();
  return cut.length >= FLOOR ? cut : text;         // too little left: leave it long
}

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

let changed = 0, skipped = [];
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const m = src.match(/<meta name="description" content="([^"]*)"/);
  if (!m) continue;
  const key = f.replace(ROOT + '/', '').replace(/\.html$/, '').replace(/\/index$/, '');
  const next = OVERRIDES[key] || trim(m[1]);
  // Not just "is the description right": og: and twitter: must carry the same
  // text, and on one page they had already drifted away from it.
  const mirrors = [/<meta property="og:description" content="([^"]*)"/, /<meta name="twitter:description" content="([^"]*)"/]
    .map((re) => (src.match(re) || [])[1]).filter((v) => v !== undefined);
  const inSync = next === m[1] && mirrors.every((v) => v === next);
  if (inSync) { if (m[1].length > LIMIT) skipped.push([f.replace(ROOT, ''), m[1].length]); continue; }
  changed++;
  if (MODE === '--dry') {
    console.log(`${String(m[1].length).padStart(4)} -> ${String(next.length).padStart(3)}  ${f.replace(ROOT, '')}`);
    console.log(`      ${next}`);
    continue;
  }
  // og:description and twitter:description carry the same text and must not
  // drift; on one page they already had. The new text is written to all three.
  let out = src;
  for (const attr of ['name="description"', 'property="og:description"', 'name="twitter:description"']) {
    const tag = new RegExp(`(<meta ${attr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} content=")[^"]*(")`);
    out = out.replace(tag, `$1${next.replace(/\$/g, '$$$$')}$2`);
  }
  if (MODE !== '--check') writeFileSync(f, out);
}

if (MODE === '--check') {
  if (changed) { console.error(`${changed} description(s) over ${LIMIT} chars. Run: node scripts/trim-descriptions.mjs`); process.exit(1); }
  console.log('Meta descriptions are within length.');
} else {
  console.log(`\n${changed} description(s) trimmed.`);
  if (skipped.length) { console.log(`${skipped.length} left long (no clean sentence break):`); skipped.forEach((s) => console.log('   ', ...s)); }
}
