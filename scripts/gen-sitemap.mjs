#!/usr/bin/env node
// Regenerates sitemap.xml from what is actually on disk.
//
// WHY THIS IS A SCRIPT. The hand-maintained sitemap drifted: /de and /nl were
// added as full locales and never reached it, so 34 live pages (17 each) plus
// /es/press and /fr/press were never submitted, and the hreflang alternates on
// the 48 entries that WERE listed still only named five locales. A hand-edited
// file rots on the next locale; a generated one does not.
//
// Run: node scripts/gen-sitemap.mjs           (writes sitemap.xml)
//      node scripts/gen-sitemap.mjs --check   (exits 1 if stale; for CI)

import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ORIGIN = 'https://www.ecodomehomes.com';
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const OUT = join(ROOT, 'sitemap.xml');

// Locale directory -> hreflang. '' is the British-English site at the root.
const LOCALES = [
  ['', 'en-GB'], ['us', 'en-US'], ['pt', 'pt-PT'],
  ['fr', 'fr-FR'], ['es', 'es-ES'], ['nl', 'nl-NL'], ['de', 'de-DE'],
];
const LOCALE_DIRS = new Set(LOCALES.map(([d]) => d).filter(Boolean));
// robots.txt disallows /proposals, so it stays out of the sitemap too.
const NOINDEX = /<meta[^>]+name=["']robots["'][^>]*content=["'][^"']*noindex/i;
const SKIP_DIRS = new Set(['.git', '.github', 'node_modules', 'api', 'scripts', 'supabase', 'images', 'js', 'docs', 'proposals']);

// Every .html under a locale, as a locale-stripped page key ('' is the home page).
function pagesFor(dir) {
  const base = dir ? join(ROOT, dir) : ROOT;
  const out = new Set();
  const walk = (abs, rel) => {
    for (const name of readdirSync(abs)) {
      const p = join(abs, name);
      if (statSync(p).isDirectory()) {
        if (SKIP_DIRS.has(name) || (!rel && !dir && LOCALE_DIRS.has(name))) continue;
        walk(p, rel ? `${rel}/${name}` : name);
      } else if (name.endsWith('.html')) {
        // A noindex page must not be submitted: Search Console reports every
        // one as "Submitted URL marked noindex". /investors and /press are
        // deliberately noindex,nofollow, so they stay out of the sitemap and
        // out of everyone else's hreflang alternates.
        if (NOINDEX.test(readFileSync(p, 'utf8'))) continue;
        const stem = name === 'index.html' ? '' : `/${name.slice(0, -5)}`;
        out.add((rel ? `/${rel}` : '') + stem);
      }
    }
  };
  walk(base, '');
  return out;
}

const byLocale = new Map(LOCALES.map(([d]) => [d, pagesFor(d)]));
const url = (dir, page) => `${ORIGIN}${dir ? '/' + dir : ''}${page || '/'}`;

// Page order follows the root site, then anything a locale has that root does not.
const order = [...byLocale.get('')].sort();
for (const [d] of LOCALES) for (const p of [...byLocale.get(d)].sort()) if (!order.includes(p)) order.push(p);

const blocks = [];
for (const page of order) {
  const have = LOCALES.filter(([d]) => byLocale.get(d).has(page));
  if (!have.length) continue;
  const alts = have.map(([d, hl]) =>
    `    <xhtml:link rel="alternate" hreflang="${hl}" href="${url(d, page)}"/>`);
  // x-default points at the root site when it has the page, else the first locale that does.
  const [defDir] = have.find(([d]) => d === '') || have[0];
  alts.push(`    <xhtml:link rel="alternate" hreflang="x-default" href="${url(defDir, page)}"/>`);
  for (const [d] of have) {
    blocks.push(`  <url>\n    <loc>${url(d, page)}</loc>\n${alts.join('\n')}\n  </url>`);
  }
}

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${blocks.join('\n')}
</urlset>
`;

if (process.argv.includes('--check')) {
  const current = readFileSync(OUT, 'utf8');
  if (current !== xml) {
    console.error('sitemap.xml is stale. Run: node scripts/gen-sitemap.mjs');
    process.exit(1);
  }
  console.log(`sitemap.xml is up to date (${blocks.length} URLs).`);
} else {
  writeFileSync(OUT, xml);
  console.log(`Wrote sitemap.xml: ${blocks.length} URLs across ${LOCALES.length} locales.`);
}
