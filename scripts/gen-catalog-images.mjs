#!/usr/bin/env node
// Generates the missing buyer-facing tier images for the intake catalog, uploads
// them to the Supabase `catalog-images` bucket, and points the catalog row at them.
//
// WHY GENERATED RATHER THAN SOURCED. Two reasons, and the second is the real one.
// Licensing: a stock photo good enough for a sales page almost always carries an
// attribution requirement, and a credits list under a buyer's estimate is clutter.
// But mainly: for several sections the three levels differ INSIDE the wall. Standard,
// acoustic and moisture-resistant partitions are identical once painted, so no
// photograph of a finished room can ever show a buyer what they are choosing between.
// A generated cutaway can. Same for greywater and rainwater, which are equipment a
// homeowner never sees.
//
// Run: node scripts/gen-catalog-images.mjs --dry-run        list what would be made
//      node scripts/gen-catalog-images.mjs                  generate, upload, wire up
//      node scripts/gen-catalog-images.mjs --only=stairs    one section
//
// Needs GEMINI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in the environment
// (or --env-file=...). The Gemini free tier has a per-PROJECT daily image quota that
// covers every image model at once, so a 429 RESOURCE_EXHAUSTED here means waiting for
// the reset or enabling billing, not switching model.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const args = process.argv.slice(2);
const arg = (n, d = null) => { const a = args.find((x) => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : d; };
const DRY = args.includes('--dry-run');
const ONLY = arg('only');
const MODEL = arg('model', 'gemini-3-pro-image');

const envFile = arg('env-file', `${process.env.HOME}/Projects/social-agent/.env.local`);
function env(k) {
  if (process.env[k]) return process.env[k];
  try {
    const m = readFileSync(envFile, 'utf8').match(new RegExp(`^${k}=(.*)$`, 'm'));
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
  } catch { return ''; }
}

// House look, applied to every prompt so the set reads as one catalog rather than
// fourteen unrelated stock photos.
const STYLE = 'Photorealistic architectural photograph, shot straight on, neutral daylight, '
  + 'soft shadows, muted natural colour palette, calm and professional. No people, no text, '
  + 'no logos, no watermarks, no measuring tape, no clutter on the floor. Sharp focus.';

// row id -> what the buyer is actually choosing. Cutaways where the difference is
// hidden once the room is finished.
const IMAGES = {
  partitions: {
    'pt-partition-standard-good': 'An interior partition wall in a modern home, half finished and half open as a clean cutaway. The finished half is smooth white plasterboard, taped and jointed, ready for paint. The open half shows vertical galvanised steel studs in a steel track at regular spacing, new and clean, with a single grey-faced plasterboard sheet on the far side. The cavity between the studs is empty.',
    'pt-partition-acoustic-better': 'An interior partition wall in a modern home, half finished and half open as a clean cutaway. The finished half is smooth white plasterboard ready for paint. The open half shows galvanised steel studs with soft yellow-grey mineral wool batts filling the cavity between them, neatly fitted, with plasterboard on the far side.',
    'pt-partition-moisture-best': 'An interior partition wall for a bathroom in a modern home, half finished and half open as a clean cutaway. The finished half is pale green moisture-resistant plasterboard, taped and jointed. The open half shows galvanised steel studs with dense mineral wool insulation filling the cavity, and green moisture-resistant board on the far side.',
  },
  stairs: {
    'pt-stairs-softwood-good': 'A simple straight flight of stairs in a bright modern home, softwood treads and risers painted soft white with a plain painted timber handrail against a pale wall. Understated and well made.',
    'pt-stairs-steel-oak-better': 'An open straight staircase in a modern home: solid oak treads on a slim blackened steel stringer, no risers, with a minimal steel handrail. Light passes between the treads.',
    'pt-stairs-floating-best': 'A floating cantilever staircase in a modern home: thick oak treads projecting from a plain pale wall with no visible structure beneath them and no stringer, a frameless glass balustrade alongside. Sculptural and calm.',
  },
  greywater: {
    'pt-greywater-diversion-good': 'A neat greywater diversion unit mounted on an exterior house wall: a compact white filter housing with grey inlet and outlet pipework running down to a subsurface drip irrigation line in a planted garden bed. Tidy, well installed, domestic scale.',
    'pt-greywater-treatment-better': 'A domestic greywater treatment unit in a clean utility room: a compact tank with a filter stage, small pump and simple control panel, plumbed with tidy pipework, one line marked for garden irrigation and one returning to the house.',
    'pt-greywater-membrane-best': 'A whole-house greywater recycling plant in a clean plant room: a large treatment tank with multi-stage filtration, UV unit, pump set and a wall-mounted controller, all neatly plumbed and labelled with clear pipe runs.',
  },
  rainwater: {
    'pt-rainwater-tank-good': 'A slimline above-ground rainwater tank in dark grey standing against the wall of a modern house, connected to the downpipe by a leaf filter and diverter, with a garden hose outlet at the base and planting around it.',
    'pt-rainwater-cistern-better': 'A buried rainwater cistern during installation in a garden: a large ribbed plastic tank set into a clean excavation on a bed of gravel, inlet and overflow pipework connected, a flush access cover at ground level and lawn beyond.',
    'pt-rainwater-retention-best': 'A large buried rainwater storage system in a garden: two big linked cisterns in a wide clean excavation with a pump chamber and manifold pipework, alongside a shallow planted retention basin with gravel and grasses.',
  },
  // Landscaping prices per COMPONENT, so a tier holds four rows. gen-intake-catalog
  // takes the default row's image, or any row's when no default exists, so these two
  // sit on the driveway row: it is the default at 'better', and at 'good' it is the
  // only one carrying an image. Both shots show the whole yard, not just the driveway.
  landscaping: {
    'pt-landscape-driveway-gravel-good': 'The outside of a modern house: a pale gravel driveway, a plain poured concrete patio slab, a simple lawn, and a basic black drip irrigation line running along a narrow planted edge. Clean and modest.',
    'pt-landscape-driveway-paver-better': 'The outside of a modern house: a concrete block paver driveway laid in a neat pattern, a large-format porcelain patio, generously planted garden beds with shrubs and grasses, and discreet drip irrigation.',
  },
};

const BUCKET = 'catalog-images';
async function upload(id, buf, SUPABASE_URL, KEY) {
  const path = `pt/${id}.jpg`;
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'image/jpeg', 'x-upsert': 'true' },
    body: buf,
  });
  if (!res.ok) throw new Error(`upload ${id}: ${res.status} ${await res.text()}`);
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
}

async function setImageUrl(id, url, SUPABASE_URL, KEY) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/construction_costs?id=eq.${id}`, {
    method: 'PATCH',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json',
               'Content-Profile': 'assistant', Prefer: 'return=minimal' },
    body: JSON.stringify({ image_url: url }),
  });
  if (!res.ok) throw new Error(`patch ${id}: ${res.status} ${await res.text()}`);
}

async function generate(prompt, KEY) {
  const body = { contents: [{ parts: [{ text: `${prompt} ${STYLE}` }] }],
                 generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: '4:3' } } };
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await res.json();
  if (!res.ok) {
    const status = j?.error?.status || res.status;
    if (status === 'RESOURCE_EXHAUSTED') {
      throw new Error('RESOURCE_EXHAUSTED: the Gemini free tier has a per-PROJECT daily image quota '
        + 'shared across every image model, so switching model will not help. Wait for the reset or enable billing.');
    }
    throw new Error(`generate: ${status} ${JSON.stringify(j).slice(0, 200)}`);
  }
  const part = (j.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData);
  if (!part) throw new Error('generate: no image in response');
  return Buffer.from(part.inlineData.data, 'base64');
}

const sections = Object.entries(IMAGES).filter(([s]) => !ONLY || s === ONLY);
if (!sections.length) { console.error(`no such section: ${ONLY}`); process.exit(1); }
const total = sections.reduce((n, [, v]) => n + Object.keys(v).length, 0);

if (DRY) {
  for (const [section, rows] of sections) {
    console.log(`\n${section}`);
    for (const [id, p] of Object.entries(rows)) console.log(`  ${id}\n    ${p.slice(0, 150)}...`);
  }
  console.log(`\n${total} image(s) would be generated with ${MODEL}.`);
  process.exit(0);
}

const GEMINI = env('GEMINI_API_KEY'), SUPABASE_URL = env('SUPABASE_URL').replace(/\/$/, ''), KEY = env('SUPABASE_SERVICE_ROLE_KEY');
for (const [k, v] of [['GEMINI_API_KEY', GEMINI], ['SUPABASE_URL', SUPABASE_URL], ['SUPABASE_SERVICE_ROLE_KEY', KEY]])
  if (!v) { console.error(`${k} missing (env or ${envFile})`); process.exit(1); }

const outDir = join(ROOT, '.cache', 'catalog-images');
mkdirSync(outDir, { recursive: true });
let ok = 0;
for (const [section, rows] of sections) {
  for (const [id, prompt] of Object.entries(rows)) {
    process.stdout.write(`  ${section}/${id} ... `);
    try {
      const buf = await generate(prompt, GEMINI);
      const local = join(outDir, `${id}.jpg`);
      writeFileSync(local, buf);
      // Strip metadata (C2PA and friends) the same way gen-image.mjs does, via sips.
      try { execFileSync('sips', ['-s', 'format', 'jpeg', '-Z', '1200', local, '--out', local], { stdio: 'ignore' }); } catch {}
      const url = await upload(id, readFileSync(local), SUPABASE_URL, KEY);
      await setImageUrl(id, url, SUPABASE_URL, KEY);
      ok += 1;
      console.log('done');
    } catch (e) {
      console.log(`FAILED: ${e.message}`);
      if (String(e.message).includes('RESOURCE_EXHAUSTED')) process.exit(1);
    }
  }
}
console.log(`\n${ok}/${total} generated and wired. Now regenerate the form catalog:\n  node scripts/gen-intake-catalog.mjs`);
