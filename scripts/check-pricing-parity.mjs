// Pricing parity checker for the EcoDomeHomes 7-page pricing calculator
// (root/en, de, es, fr, nl, pt, us). Every page carries its own hand-copied
// inline pricing engine (no shared bundle at runtime), sourced at load time
// from the single shared file js/pricing-rates.js (window.EDH_PRICING).
// Before that file existed, the six EUR-labelled pages (root, de, es, fr,
// nl, pt) drifted onto a stale rate model with a wrong US rate --
// {v:1010,f:81500} instead of the real {v:2100,f:0} -- while us/pricing.html
// carried the correct, newer numbers. A US buyer configuring a 117 m2
// Builder-tier dome on any of the six EUR pages was quoted about 23% under
// the real price ($231,617 instead of $285,700).
//
// This is NOT a text/grep check: it EXECUTES each page's real inline
// pricing engine in a node:vm sandbox (extracting the engine straight out
// of the page's <script> tag, stripping only the outer IIFE wrapper and the
// const/let -> var rewrite vm needs to read top-level bindings back out --
// no formula, constant, or number here is reimplemented) and asserts:
//
//   1. Every page's rate card resolves the two figures on Chris's ledger
//      (Portugal Builder, 117 m2, no add-ons => EUR 235,245; US Builder,
//      117 m2, no add-ons => USD 285,700), computed with the page's own
//      compute function, not a re-derivation.
//   2. Every page's local COUNTRY_RATES / EUR_TO_USD / M2_TO_FT2 constants
//      are byte-identical (same JSON) across all seven pages, and match
//      window.EDH_PRICING -- i.e. every page is actually wired to the
//      shared file rather than carrying a re-introduced local override.
//
// Usage:
//   node scripts/check-pricing-parity.mjs
//   npm run check:pricing
//
// Unlike check-locale-parity.mjs (a report/lint tool), this is a hard
// correctness gate: it exits non-zero the moment any page's numbers drift.

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const PAGES = [
  { label: 'root (en)', file: 'pricing.html', totalFn: 'compute', m2VarName: 'M2_TO_FT2' },
  { label: 'de', file: 'de/pricing.html', totalFn: 'compute', m2VarName: 'M2_TO_FT2' },
  { label: 'es', file: 'es/pricing.html', totalFn: 'compute', m2VarName: 'M2_TO_FT2' },
  { label: 'fr', file: 'fr/pricing.html', totalFn: 'compute', m2VarName: 'M2_TO_FT2' },
  { label: 'nl', file: 'nl/pricing.html', totalFn: 'compute', m2VarName: 'M2_TO_FT2' },
  { label: 'pt', file: 'pt/pricing.html', totalFn: 'compute', m2VarName: 'M2_TO_FT2' },
  // us/pricing.html names its local binding M2_TO_SQFT (matches its own
  // sq-ft-first code); the exported shared constant is still M2_TO_FT2.
  { label: 'us', file: 'us/pricing.html', totalFn: 'computeTotalEUR', m2VarName: 'M2_TO_SQFT' },
];

// Chris's ledger, the acceptance criteria this whole check exists to guard.
const CANONICAL = {
  portugalBuilderEur: 235245, // Portugal, 117 m2, Builder tier, no add-ons
  usBuilderUsd: 285700, // United States, 117 m2, Builder tier, no add-ons
};
const SIZE_M2 = 117;

const PRICING_RATES_SRC = fs.readFileSync(path.join(REPO_ROOT, 'js', 'pricing-rates.js'), 'utf8');

// ---- minimal, permissive "black hole" DOM/BOM stub -------------------
// The extracted engine prefix (see extractComputePrefix below) never
// reaches the DOM-wiring code that follows the pure calculation functions
// in every page, so this only needs to survive the handful of top-level
// statements ABOVE that point (creating the Supabase client, assigning to
// `window`). It is intentionally generic rather than page-specific, so a
// future page reshuffle does not silently stop being checked.
function makeStub(label) {
  const target = function stub() { return makeStub(`${label}()`); };
  target[Symbol.toPrimitive] = () => 0;
  const handler = {
    get(t, prop, receiver) {
      if (prop === Symbol.toPrimitive) return Reflect.get(t, prop, receiver);
      if (prop === 'length') return 0;
      if (prop in t) return Reflect.get(t, prop, receiver);
      return makeStub(`${label}.${String(prop)}`);
    },
    set() { return true; },
    apply() { return makeStub(`${label}()`); },
    construct() { return makeStub(`new ${label}`); },
    has() { return true; },
  };
  return new Proxy(target, handler);
}

function buildSandbox() {
  const sandbox = {
    window: {},
    document: {
      getElementById: () => makeStub('el'),
      querySelectorAll: () => [],
      documentElement: makeStub('documentElement'),
      addEventListener: () => {},
      createElement: () => makeStub('el'),
      readyState: 'complete',
    },
    supabase: { createClient: () => makeStub('SB') },
    localStorage: makeStub('localStorage'),
    fetch: () => Promise.resolve(makeStub('response')),
    console: { log() {}, warn() {}, error() {} },
    setTimeout,
    clearTimeout,
  };
  vm.createContext(sandbox);
  return sandbox;
}

// ---- engine extraction -------------------------------------------------

function extractInlineEngine(html, file) {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const engine = scripts.find((s) => s.includes('COUNTRY_RATES'));
  if (!engine) throw new Error(`${file}: no inline <script> containing COUNTRY_RATES found`);
  return engine;
}

function stripIife(src, file) {
  const trimmed = src.trim();
  const startMatch = trimmed.match(/^\(function\(\)\s*\{/);
  if (!startMatch) throw new Error(`${file}: engine script does not open with the expected "(function(){" IIFE`);
  const endMatch = trimmed.match(/\}\)\(\);?\s*$/);
  if (!endMatch) throw new Error(`${file}: engine script does not close with the expected "})();" IIFE`);
  return trimmed.slice(startMatch[0].length, trimmed.length - endMatch[0].length);
}

// Finds the end (exclusive index, just past the closing brace) of
// `function <name>(...){ ... }` via brace counting from its opening brace.
function findFunctionEnd(src, name, file) {
  const sig = `function ${name}(`;
  const start = src.indexOf(sig);
  if (start === -1) throw new Error(`${file}: function ${name}() not found in the extracted engine`);
  const braceStart = src.indexOf('{', start);
  let depth = 0;
  for (let i = braceStart; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  throw new Error(`${file}: unbalanced braces scanning function ${name}()`);
}

// vm.runInContext does not attach top-level `let`/`const` bindings to the
// context's global object (only `var` does) -- rewrite them so `state`,
// `compute`, `COUNTRY_RATES`, etc. are readable back out after execution.
// Safe here: we only ever read these back as plain values/functions, we
// never depend on block-scoping or reassignment restrictions.
function constLetToVar(src) {
  return src.replace(/\b(const|let)\b/g, 'var');
}

// Extracts and runs the REAL engine (constants + `compute`/`computeTotalEUR`
// and everything they call), stopping just past that function -- before any
// DOM-wiring code. Returns the live vm context, so callers can mutate
// `state` and re-invoke the total function for other scenarios.
function loadEngine(page) {
  const abs = path.join(REPO_ROOT, page.file);
  const html = fs.readFileSync(abs, 'utf8');
  const engineSrc = extractInlineEngine(html, page.file);
  const body = stripIife(engineSrc, page.file);
  const end = findFunctionEnd(body, page.totalFn, page.file);
  const prefix = constLetToVar(body.slice(0, end));

  const ctx = buildSandbox();
  vm.runInContext(PRICING_RATES_SRC, ctx, { filename: 'js/pricing-rates.js' });
  vm.runInContext(prefix, ctx, { filename: page.file });

  if (typeof ctx[page.totalFn] !== 'function') {
    throw new Error(`${page.file}: ${page.totalFn}() did not survive extraction`);
  }
  if (!ctx.state || typeof ctx.state !== 'object') {
    throw new Error(`${page.file}: state object did not survive extraction`);
  }
  return ctx;
}

function totalFor(ctx, totalFn, country) {
  ctx.state.country = country;
  ctx.state.tier = 'builder';
  ctx.state.size = SIZE_M2;
  ctx.state.config = 'family';
  ctx.state.configMult = 1.0;
  ctx.state.finish = 0;
  ctx.state.floorEnabled = false;
  ctx.state.floorSize = 0;
  // The two engine shapes disagree on how greenhouse/addons are stored:
  // the six EUR pages use string-keyed objects ({none,integrated,...} /
  // {solar:false,...}), us/pricing.html stores the already-summed EUR cost
  // directly (a plain number). Detect by the CURRENT runtime type rather
  // than by which country is being tested, since both scenarios run
  // against the same page/engine.
  ctx.state.greenhouse = (typeof ctx.state.greenhouse === 'number') ? 0 : 'none';
  if (ctx.state.addons && typeof ctx.state.addons === 'object') {
    Object.keys(ctx.state.addons).forEach((k) => { ctx.state.addons[k] = false; });
  } else {
    ctx.state.addons = 0;
  }
  const eurTotal = ctx[totalFn]();
  if (eurTotal === null || typeof eurTotal !== 'number' || Number.isNaN(eurTotal)) {
    throw new Error(`${totalFn}() returned ${eurTotal} for country=${country}`);
  }
  return eurTotal;
}

// ---- main ---------------------------------------------------------------

function main() {
  const failures = [];
  const results = [];

  for (const page of PAGES) {
    let ctx;
    try {
      ctx = loadEngine(page);
    } catch (e) {
      failures.push(`${page.label} (${page.file}): FAILED TO LOAD ENGINE -- ${e.message}`);
      continue;
    }

    let portugalEur;
    let usEur;
    try {
      portugalEur = totalFor(ctx, page.totalFn, 'portugal');
      // Reload a fresh engine for the second scenario: state is shared
      // mutable object, cheaper and safer to just re-derive from scratch.
      ctx = loadEngine(page);
      usEur = totalFor(ctx, page.totalFn, 'us');
    } catch (e) {
      failures.push(`${page.label} (${page.file}): FAILED TO COMPUTE -- ${e.message}`);
      continue;
    }

    const usUsd = Math.round(usEur * ctx.EUR_TO_USD);

    results.push({
      page,
      portugalEur,
      usUsd,
      countryRates: ctx.COUNTRY_RATES,
      eurToUsd: ctx.EUR_TO_USD,
      m2ToFt2: ctx[page.m2VarName],
      edhPricing: ctx.window.EDH_PRICING,
    });

    if (portugalEur !== CANONICAL.portugalBuilderEur) {
      failures.push(
        `${page.label} (${page.file}): Portugal Builder 117m2 no-add-ons = EUR ${portugalEur.toLocaleString('en-US')}, expected EUR ${CANONICAL.portugalBuilderEur.toLocaleString('en-US')}`
      );
    }
    if (usUsd !== CANONICAL.usBuilderUsd) {
      failures.push(
        `${page.label} (${page.file}): US Builder 117m2 no-add-ons = USD ${usUsd.toLocaleString('en-US')}, expected USD ${CANONICAL.usBuilderUsd.toLocaleString('en-US')}`
      );
    }
  }

  console.log('Pricing parity check across 7 pricing pages\n');
  for (const r of results) {
    console.log(
      `  ${r.page.label.padEnd(10)} Portugal Builder = EUR ${r.portugalEur.toLocaleString('en-US')}   US Builder = USD ${r.usUsd.toLocaleString('en-US')}`
    );
  }
  console.log('');

  // Rate constants must be byte-identical (same JSON) across all 7 pages,
  // and each page's own local binding must equal window.EDH_PRICING's --
  // i.e. actually wired to the shared file, not a re-introduced local copy.
  if (results.length === PAGES.length) {
    const reference = JSON.stringify(results[0].countryRates);
    for (const r of results) {
      const local = JSON.stringify(r.countryRates);
      const shared = JSON.stringify(r.edhPricing && r.edhPricing.COUNTRY_RATES);
      if (local !== reference) {
        failures.push(`${r.page.label} (${r.page.file}): COUNTRY_RATES differs from ${results[0].page.label} -- ${local}`);
      }
      if (local !== shared) {
        failures.push(`${r.page.label} (${r.page.file}): local COUNTRY_RATES does not match window.EDH_PRICING.COUNTRY_RATES -- page is not wired to js/pricing-rates.js`);
      }
      if (r.eurToUsd !== results[0].eurToUsd) {
        failures.push(`${r.page.label} (${r.page.file}): EUR_TO_USD = ${r.eurToUsd}, expected ${results[0].eurToUsd}`);
      }
      if (r.m2ToFt2 !== results[0].m2ToFt2) {
        failures.push(`${r.page.label} (${r.page.file}): M2_TO_FT2 = ${r.m2ToFt2}, expected ${results[0].m2ToFt2}`);
      }
    }
    console.log(`Rate card (COUNTRY_RATES): ${reference}`);
    console.log(`EUR_TO_USD: ${results[0].eurToUsd}   M2_TO_FT2: ${results[0].m2ToFt2}\n`);
  }

  if (failures.length) {
    console.log(`FAIL: ${failures.length} pricing drift issue(s) found:\n`);
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }

  console.log('OK: all 7 pages resolve identical rate constants and match Chris\'s ledger.');
}

main();
