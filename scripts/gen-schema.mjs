#!/usr/bin/env node
// Injects the structured data (JSON-LD) that the pages were missing.
//
// WHY. Before this, 7 of 118 pages carried any schema at all: an Organization
// block on the seven home pages. The home page FAQ (six real Q&A in every
// locale) and all 49 news articles were invisible as structured content, so
// Google had no headline, author or publish date for an article and no way to
// surface the FAQ as a rich result.
//
// Generated rather than hand-written because the same article exists in seven
// locales; a hand-edited block drifts the moment one of them is retranslated.
// Article dates come from the English root copy, which is the canonical one.
//
// Run: node scripts/gen-schema.mjs           (writes)
//      node scripts/gen-schema.mjs --check   (exits 1 if stale; for CI)

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ORIGIN = 'https://www.ecodomehomes.com';
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const ORG = `${ORIGIN}/#organization`;
const OPEN = '<!-- schema:auto -->';
const CLOSE = '<!-- /schema:auto -->';

const LOCALES = [['', 'en-GB'], ['us', 'en-US'], ['pt', 'pt-PT'], ['fr', 'fr-FR'],
                 ['es', 'es-ES'], ['nl', 'nl-NL'], ['de', 'de-DE']];

const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const decode = (s) => s
  .replace(/<[^>]+>/g, '')
  .replace(/&middot;/g, '·').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&euro;/g, '€')
  .replace(/\s+/g, ' ').trim();
const grab = (h, re) => { const m = h.match(re); return m ? decode(m[1]) : null; };

// ---- Article dates: parsed once from the English root copy -----------------
const MONTHS = 'january february march april may june july august september october november december'.split(' ');
function dateOf(slug) {
  const meta = grab(read(`updates/${slug}.html`), /<p class="post-meta">(.*?)<\/p>/s) || '';
  const m = meta.match(/([A-Z][a-z]+)\s+(\d{1,2}),\s*(\d{4})/);
  if (!m) throw new Error(`no date in updates/${slug}.html post-meta: ${meta}`);
  const mm = String(MONTHS.indexOf(m[1].toLowerCase()) + 1).padStart(2, '0');
  return `${m[3]}-${mm}-${String(m[2]).padStart(2, '0')}`;
}
function authorOf(slug) {
  const meta = grab(read(`updates/${slug}.html`), /<p class="post-meta">(.*?)<\/p>/s) || '';
  const who = meta.split('·')[0].trim();
  // "Staff Writer(s)" is the newsroom, not a person.
  return /^staff writers?$/i.test(who)
    ? { '@type': 'Organization', name: 'EcoDomeHomes', '@id': ORG }
    : { '@type': 'Person', name: who };
}

const SLUGS = readdirSync(join(ROOT, 'updates'))
  .filter((f) => f.endsWith('.html')).map((f) => f.slice(0, -5)).sort();
const DATE = Object.fromEntries(SLUGS.map((s) => [s, dateOf(s)]));
const AUTHOR = Object.fromEntries(SLUGS.map((s) => [s, authorOf(s)]));

// ---- Builders --------------------------------------------------------------
const url = (dir, path) => `${ORIGIN}${dir ? '/' + dir : ''}${path}`;

function faqBlock(html) {
  const items = [...html.matchAll(/<details>\s*<summary>(.*?)<\/summary>\s*(.*?)<\/details>/gs)]
    .map(([, q, a]) => ({ '@type': 'Question', name: decode(q),
      acceptedAnswer: { '@type': 'Answer', text: decode(a) } }))
    .filter((i) => i.name && i.acceptedAnswer.text);
  return items.length ? { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: items } : null;
}

function articleBlocks(html, dir, lang, slug) {
  const canonical = grab(html, /rel="canonical" href="([^"]+)"/) || url(dir, `/updates/${slug}`);
  const hero = html.match(/<img[^>]+src="(\/images\/post-[^"]+)"/);
  const image = ORIGIN + (hero ? hero[1] : (grab(html, /property="og:image" content="([^"]+)"/) || '').replace(ORIGIN, ''));
  const updates = url(dir, '/updates');
  return [
    { '@context': 'https://schema.org', '@type': 'NewsArticle',
      headline: grab(html, /<h1[^>]*>(.*?)<\/h1>/s),
      description: grab(html, /name="description" content="([^"]+)"/),
      image: [image],
      datePublished: DATE[slug], dateModified: DATE[slug],
      author: AUTHOR[slug],
      publisher: { '@type': 'Organization', name: 'EcoDomeHomes', '@id': ORG,
        logo: { '@type': 'ImageObject', url: `${ORIGIN}/images/ecodomehomes-logo.png` } },
      inLanguage: lang,
      mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
      isPartOf: { '@type': 'Blog', '@id': updates, name: 'EcoDomeHomes Updates' } },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: url(dir, '/') },
      { '@type': 'ListItem', position: 2, name: 'Updates', item: updates },
      { '@type': 'ListItem', position: 3, name: grab(html, /<h1[^>]*>(.*?)<\/h1>/s) } ] },
  ];
}

// ---- Apply -----------------------------------------------------------------
function render(blocks) {
  const body = blocks.map((b) =>
    `<script type="application/ld+json">\n${JSON.stringify(b, null, 1)}\n</script>`).join('\n');
  return `${OPEN}\n${body}\n${CLOSE}`;
}

function apply(rel, blocks, extra = (h) => h) {
  let html = read(rel);
  const chunk = render(blocks);
  html = html.includes(OPEN)
    ? html.replace(new RegExp(`${OPEN}[\\s\\S]*?${CLOSE}`), chunk)
    : html.replace('</head>', `${chunk}\n</head>`);
  html = extra(html);
  const before = read(rel);
  if (html !== before) { if (!CHECK) writeFileSync(join(ROOT, rel), html); return rel; }
  return null;
}

const CHECK = process.argv.includes('--check');
const changed = [];

for (const [dir, lang] of LOCALES) {
  const home = join(dir, 'index.html');
  if (!existsSync(join(ROOT, home))) continue;
  const faq = faqBlock(read(home));
  if (faq) { const c = apply(home, [faq]); if (c) changed.push(c); }

  for (const slug of SLUGS) {
    const rel = join(dir, 'updates', `${slug}.html`);
    if (!existsSync(join(ROOT, rel))) continue;
    const c = apply(rel, articleBlocks(read(rel), dir, lang, slug),
      // An article is not og:type "website"; that is what every one of them said.
      (h) => h.replace(/(<meta property="og:type" content=")website(")/, '$1article$2'));
    if (c) changed.push(c);
  }
}

if (CHECK) {
  if (changed.length) {
    console.error(`Structured data is stale on ${changed.length} page(s). Run: node scripts/gen-schema.mjs`);
    changed.slice(0, 10).forEach((c) => console.error('  ' + c));
    process.exit(1);
  }
  console.log('Structured data is up to date.');
} else {
  console.log(`Structured data written to ${changed.length} page(s).`);
}
