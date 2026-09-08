#!/usr/bin/env node
// Generates js/intake-catalog.json, the section and tier data the buyer intake
// form (intake.html) is built from.
//
// WHY THIS IS A SCRIPT. The estimator catalog (assistant.construction_costs,
// region PT) has 26 residential sections and about 175 options, and it is
// edited whenever a price or a product changes. A hand-written form would
// drift from it the first time someone touched a row. So the form is generated:
// the catalog decides WHICH sections and tiers exist and which product families
// sit under each tier; scripts/data/intake-copy.json supplies the plain-English
// meaning of every level. If the catalog gains a section this file has no copy
// for, or loses one it does, generation fails and --check fails, which is the
// point.
//
// WHAT NEVER LEAVES THIS SCRIPT. The catalog rows are Portuguese SKUs with
// Braga labor rates. A buyer in Michigan must never see "Termoacumulador
// Ariston 200L, EUR 349.59". So the output carries tier keys, plain-English
// copy, the generic product families under each tier (the catalog's `label`
// column, which is already brand-free), and a representative image where the
// catalog has one. material_unit_cost, labor_unit_cost, source, sku, brand,
// product_url, unit and the raw item name are dropped here and --check refuses
// an output that carries a price, a currency, or any of those keys.
//
// Run: node scripts/gen-intake-catalog.mjs           (writes js/intake-catalog.json)
//      node scripts/gen-intake-catalog.mjs --check   (exits 1 if invalid or stale)
//
// Reading the catalog needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the
// environment (construction_costs is RLS-locked). In --check mode without them
// the structural and no-price invariants still run against the committed file;
// only the drift-against-catalog comparison is skipped, and it says so.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const COPY_PATH = join(ROOT, 'scripts', 'data', 'intake-copy.json');
const OUT_PATH = join(ROOT, 'js', 'intake-catalog.json');
const CHECK = process.argv.includes('--check');

const REGION = 'PT';
const EXCLUDED_SECTIONS = new Set(['commercial-institutional']);
const TIERS = ['good', 'better', 'best'];

// The catalog's short labels are written for a European reader. The form is
// American English throughout (house rule), so the handful of spellings that
// leak are normalized here rather than edited in the database.
const AMERICAN = [
  [/\baluminium\b/gi, (m) => (m[0] === 'A' ? 'Aluminum' : 'aluminum')],
  [/\bmould\b/gi, (m) => (m[0] === 'M' ? 'Mold' : 'mold')],
  [/\bfibreglass\b/gi, (m) => (m[0] === 'F' ? 'Fiberglass' : 'fiberglass')],
  [/\bcolour\b/gi, (m) => (m[0] === 'C' ? 'Color' : 'color')],
  [/\bmetres?\b/gi, (m) => m.replace(/metre/i, (x) => (x[0] === 'M' ? 'Meter' : 'meter'))],
  [/\bworktop\b/gi, (m) => (m[0] === 'W' ? 'Countertop' : 'countertop')],
  [/\bskirting\b/gi, (m) => (m[0] === 'S' ? 'Baseboard' : 'baseboard')],
  [/\btap\b/gi, (m) => (m[0] === 'T' ? 'Faucet' : 'faucet')],
];
function americanize(s) {
  let out = String(s);
  for (const [re, fn] of AMERICAN) out = out.replace(re, fn);
  return out;
}

// ---- catalog fetch (read-only) ---------------------------------------------
function credentials() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url: url.replace(/\/$/, ''), key } : null;
}

async function fetchCatalog({ url, key }) {
  const qs = new URLSearchParams({
    select: 'section,tier,component,label,is_default,image_url',
    region: `eq.${REGION}`,
    section: 'not.is.null',
    order: 'section.asc,tier.asc,is_default.desc,label.asc',
    limit: '2000',
  });
  const res = await fetch(`${url}/rest/v1/construction_costs?${qs}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Accept-Profile': 'assistant' },
  });
  if (!res.ok) throw new Error(`catalog fetch failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const rows = await res.json();
  return rows.filter((r) => r.section && !EXCLUDED_SECTIONS.has(r.section));
}

// ---- build --------------------------------------------------------------------
function build(rows, copy) {
  const bySection = new Map();
  for (const r of rows) {
    if (!bySection.has(r.section)) bySection.set(r.section, []);
    bySection.get(r.section).push(r);
  }

  const copyKeys = Object.keys(copy.sections);
  const catalogKeys = [...bySection.keys()];
  const missingCopy = catalogKeys.filter((k) => !copy.sections[k]);
  const missingCatalog = copyKeys.filter((k) => !bySection.has(k));
  if (missingCopy.length) throw new Error(`catalog sections with no copy in scripts/data/intake-copy.json: ${missingCopy.join(', ')}`);
  if (missingCatalog.length) throw new Error(`copy for sections the catalog no longer has: ${missingCatalog.join(', ')}`);

  const groupOrder = copy.groups.map((g) => g.key);
  const sections = [];
  for (const key of copyKeys) {
    const c = copy.sections[key];
    const catalogRows = bySection.get(key);
    const tiers = {};
    for (const tier of TIERS) {
      const tierRows = catalogRows.filter((r) => r.tier === tier);
      if (!tierRows.length) throw new Error(`${key}: catalog has no '${tier}' tier`);
      const tierCopy = c.tiers && c.tiers[tier];
      if (!tierCopy || !tierCopy.headline || !tierCopy.description) throw new Error(`${key}/${tier}: copy needs headline and description`);
      // Product families under this tier, brand-free and de-duplicated. The
      // PACKAGE rows are bundles of the others, so they add nothing here.
      const includes = [];
      for (const r of tierRows) {
        if (r.component === 'PACKAGE' || !r.label) continue;
        const label = americanize(r.label.replace(/\s+/g, ' ').trim());
        if (!includes.includes(label)) includes.push(label);
      }
      // The picture has to show what actually gets PRICED. When the tier has a
      // designated default row, that row IS the quote, so borrowing a sibling's
      // photo misrepresents the purchase: 'As-sprayed concrete texture' and
      // 'Basic skim coat' both sit in interior_wall_finish/good and look nothing
      // alike, and before this the buyer saw a smooth plastered wall on the
      // option that leaves the concrete rough. So borrow only when NO row in the
      // tier is marked default, and otherwise show the placeholder and say so.
      const defaultRow = tierRows.find((r) => r.is_default);
      const withImage = defaultRow
        ? (defaultRow.image_url ? defaultRow : null)
        : tierRows.find((r) => r.image_url);
      tiers[tier] = {
        headline: tierCopy.headline,
        description: tierCopy.description,
        includes,
        image: withImage ? withImage.image_url : null,
      };
    }
    sections.push({
      key,
      group: c.group,
      title: c.title,
      question: c.question,
      help: c.help || '',
      optional: Boolean(c.optional),
      none_label: c.optional ? c.none_label || 'Not needed' : null,
      tiers,
    });
  }
  // Group order first, then the copy file's own order inside a group.
  sections.sort((a, b) => groupOrder.indexOf(a.group) - groupOrder.indexOf(b.group) || copyKeys.indexOf(a.key) - copyKeys.indexOf(b.key));

  // A version that moves only when the catalog's structure or the copy moves,
  // so a stored answer can say which form it was made against.
  const version = createHash('sha256')
    .update(JSON.stringify({ sections, groups: copy.groups }))
    .digest('hex')
    .slice(0, 12);

  return { catalog_version: version, region_neutral: true, groups: copy.groups, sections };
}

// ---- invariants: what must never be in the shipped file --------------------------
const FORBIDDEN_KEY = /cost|price|source|sku|brand|product_url|labor|material|unit_|^item$|^unit$/i;
const FORBIDDEN_TEXT = [
  [/[€$£]/, 'a currency symbol'],
  [/\b(EUR|USD|GBP)\b/, 'a currency code'],
  [/\b\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{2})?\b/, 'a money-looking figure'],
  [/[–—]/, 'an em or en dash (house style)'],
  [/\b(whilst|amongst|colour|aluminium|mould|fibreglass|metres?)\b/i, 'a British spelling or idiom'],
];
function validate(data) {
  const problems = [];
  const walk = (node, path) => {
    if (Array.isArray(node)) return node.forEach((v, i) => walk(v, `${path}[${i}]`));
    if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) {
        if (FORBIDDEN_KEY.test(k)) problems.push(`${path}.${k}: forbidden key`);
        walk(v, `${path}.${k}`);
      }
      return;
    }
    if (typeof node === 'string') {
      for (const [re, what] of FORBIDDEN_TEXT) if (re.test(node)) problems.push(`${path}: contains ${what}: "${node.slice(0, 60)}"`);
    }
  };
  walk(data, 'catalog');
  if (!Array.isArray(data.sections)) problems.push('no sections array');
  else {
    for (const s of data.sections) {
      if (EXCLUDED_SECTIONS.has(s.key)) problems.push(`${s.key}: excluded section present`);
      for (const t of TIERS) {
        const tier = s.tiers && s.tiers[t];
        if (!tier || !tier.headline || !tier.description) problems.push(`${s.key}: tier '${t}' incomplete`);
      }
    }
  }
  return problems;
}

// ---- main ---------------------------------------------------------------------
const copy = JSON.parse(readFileSync(COPY_PATH, 'utf8'));
const creds = credentials();

if (CHECK) {
  if (!existsSync(OUT_PATH)) { console.error(`missing ${OUT_PATH}. Run: node scripts/gen-intake-catalog.mjs`); process.exit(1); }
  const committed = JSON.parse(readFileSync(OUT_PATH, 'utf8'));
  const problems = validate(committed);
  if (problems.length) {
    console.error(`js/intake-catalog.json fails ${problems.length} invariant(s):`);
    problems.slice(0, 20).forEach((p) => console.error('  ' + p));
    process.exit(1);
  }
  const expectedKeys = Object.keys(copy.sections).sort().join(',');
  const gotKeys = committed.sections.map((s) => s.key).sort().join(',');
  if (expectedKeys !== gotKeys) {
    console.error('js/intake-catalog.json sections do not match scripts/data/intake-copy.json. Run: node scripts/gen-intake-catalog.mjs');
    process.exit(1);
  }
  if (!creds) {
    console.log(`Intake catalog passes invariants (${committed.sections.length} sections, no prices). SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set, so drift against the live catalog was not checked.`);
    process.exit(0);
  }
  const fresh = build(await fetchCatalog(creds), copy);
  if (JSON.stringify(fresh) !== JSON.stringify(committed)) {
    console.error('js/intake-catalog.json is stale against the catalog or the copy. Run: node scripts/gen-intake-catalog.mjs');
    process.exit(1);
  }
  console.log(`Intake catalog is up to date (${committed.sections.length} sections, version ${committed.catalog_version}, no prices).`);
} else {
  if (!creds) { console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to read the catalog.'); process.exit(1); }
  const data = build(await fetchCatalog(creds), copy);
  const problems = validate(data);
  if (problems.length) {
    console.error(`refusing to write: ${problems.length} invariant(s) failed`);
    problems.slice(0, 20).forEach((p) => console.error('  ' + p));
    process.exit(1);
  }
  writeFileSync(OUT_PATH, JSON.stringify(data, null, 1) + '\n');
  console.log(`Wrote js/intake-catalog.json: ${data.sections.length} sections, version ${data.catalog_version}.`);
  const noImage = [];
  for (const sec of data.sections) {
    for (const t of ['good', 'better', 'best']) if (!sec.tiers[t].image) noImage.push(`${sec.key}/${t}`);
  }
  if (noImage.length) {
    console.warn(`  no image on ${noImage.length} tier(s), placeholder shown: ${noImage.join(', ')}`);
  }
}
