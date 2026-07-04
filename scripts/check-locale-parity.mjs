// Locale parity checker for the EcoDomeHomes 5-locale mirror (root/en, es, fr,
// pt, us). The site has no shared templating layer: every page is a hand-copied
// HTML file per locale, so a fix or a new section landed in one locale can
// silently never make it into the others. This script does not enforce word-
// for-word content equality (translations are naturally different lengths); it
// flags two cheap, high-signal drift indicators instead:
//
//   1. Presence drift: a page that exists in some locales but not others.
//   2. Structural drift: for a page that exists in 2+ locales, the counts of
//      structural tags (sections, headings, forms, images, links, scripts)
//      differ enough that a locale likely missed a content/markup change that
//      landed elsewhere.
//
// Usage:
//   node scripts/check-locale-parity.mjs            report only, exit 0
//   node scripts/check-locale-parity.mjs --strict    exit 1 if drift is found
//
// This is a report/lint tool, not a content fixer: known intentional
// differences (e.g. a page that only exists in one locale) still print, so a
// human can confirm "expected" vs "missed the sync."

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STRICT = process.argv.includes('--strict');

const LOCALES = ['root', 'es', 'fr', 'pt', 'us'];
const localeDir = (locale) => (locale === 'root' ? REPO_ROOT : path.join(REPO_ROOT, locale));

// Structural signature: counts of tags/attributes that roughly track a page's
// sections and interactive surface, independent of translated text length.
const SIGNATURE_PATTERNS = {
  section: /<section[\s>]/gi,
  h1: /<h1[\s>]/gi,
  h2: /<h2[\s>]/gi,
  h3: /<h3[\s>]/gi,
  form: /<form[\s>]/gi,
  img: /<img[\s>]/gi,
  script: /<script[\s>]/gi,
  anchor: /<a\s/gi,
};

// A locale mirror is naturally never byte-identical, so only flag a spread big
// enough to indicate a real missed section, not translation-length noise.
const MIN_ABS_SPREAD = 2;
const MIN_REL_SPREAD = 0.25; // 25% relative to the max count for that tag

function listHtmlFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.html'))
    .map((e) => e.name);
}

// Build { pageName -> { locale -> absolutePath } } for every locale, covering
// top-level pages plus the "updates/<slug>.html" article pages one level deep.
function collectPages() {
  const pages = new Map();
  for (const locale of LOCALES) {
    const dir = localeDir(locale);
    for (const name of listHtmlFiles(dir)) {
      addPage(pages, name, locale, path.join(dir, name));
    }
    const updatesDir = path.join(dir, 'updates');
    for (const name of listHtmlFiles(updatesDir)) {
      addPage(pages, path.join('updates', name), locale, path.join(updatesDir, name));
    }
  }
  return pages;
}

function addPage(pages, pageName, locale, absPath) {
  if (!pages.has(pageName)) pages.set(pageName, {});
  pages.get(pageName)[locale] = absPath;
}

function signatureFor(absPath) {
  const html = fs.readFileSync(absPath, 'utf8');
  const counts = {};
  for (const [key, pattern] of Object.entries(SIGNATURE_PATTERNS)) {
    counts[key] = (html.match(pattern) || []).length;
  }
  return counts;
}

function reportPresenceDrift(pages) {
  const findings = [];
  for (const [pageName, byLocale] of pages) {
    const present = LOCALES.filter((l) => byLocale[l]);
    if (present.length === LOCALES.length) continue;
    const missing = LOCALES.filter((l) => !byLocale[l]);
    findings.push({ pageName, present, missing });
  }
  return findings;
}

function reportStructuralDrift(pages) {
  const findings = [];
  for (const [pageName, byLocale] of pages) {
    const present = LOCALES.filter((l) => byLocale[l]);
    if (present.length < 2) continue; // nothing to compare
    const signatures = {};
    for (const locale of present) signatures[locale] = signatureFor(byLocale[locale]);

    const flaggedTags = [];
    for (const tag of Object.keys(SIGNATURE_PATTERNS)) {
      const values = present.map((l) => signatures[l][tag]);
      const max = Math.max(...values);
      const min = Math.min(...values);
      const spread = max - min;
      if (spread >= MIN_ABS_SPREAD && spread >= max * MIN_REL_SPREAD) {
        flaggedTags.push({ tag, min, max, byLocale: signatures });
      }
    }
    if (flaggedTags.length) findings.push({ pageName, flaggedTags });
  }
  return findings;
}

function main() {
  const pages = collectPages();
  const presenceFindings = reportPresenceDrift(pages);
  const structuralFindings = reportStructuralDrift(pages);

  console.log(`Locale parity check across ${LOCALES.join(', ')} (${pages.size} distinct pages)\n`);

  if (presenceFindings.length) {
    console.log(`Presence drift (page missing in at least one locale): ${presenceFindings.length}`);
    for (const f of presenceFindings) {
      console.log(`  - ${f.pageName}: present in [${f.present.join(', ')}], missing from [${f.missing.join(', ')}]`);
    }
    console.log('');
  } else {
    console.log('Presence drift: none, every page exists in every locale.\n');
  }

  if (structuralFindings.length) {
    console.log(`Structural drift (tag-count spread across locales): ${structuralFindings.length}`);
    for (const f of structuralFindings) {
      console.log(`  - ${f.pageName}:`);
      for (const t of f.flaggedTags) {
        const perLocale = Object.entries(t.byLocale)
          .map(([locale, counts]) => `${locale}=${counts[t.tag]}`)
          .join(', ');
        console.log(`      <${t.tag}> spread ${t.min}-${t.max}: ${perLocale}`);
      }
    }
    console.log('');
  } else {
    console.log('Structural drift: none beyond the tolerance threshold.\n');
  }

  const hasDrift = presenceFindings.length > 0 || structuralFindings.length > 0;
  if (STRICT && hasDrift) {
    console.log('FAIL (--strict): drift found above.');
    process.exit(1);
  }
  console.log(hasDrift ? 'Report only (pass --strict to fail CI on drift).' : 'OK.');
}

main();
