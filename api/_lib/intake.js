// Shared logic for the buyer intake form (intake.html -> api/intake.js).
//
// What lives here: the shape of an intake record, the normalization of what
// the browser sends, the two catalog gaps that are flagged rather than priced,
// and the readable summary that goes to the owner by email and onto the GHL
// contact. Pure functions, no I/O, so api/_lib/intake.test.js can run every
// branch offline.
//
// THE FORM NEVER PRICES ANYTHING. An answer is a tier key (good / better /
// best), a count, a choice or free text. The estimate is produced by hand from
// the summary below. The only figures in here are the buyer's own: floor area
// and the budget range they chose.

'use strict';

const CATALOG = require('../../js/intake-catalog.json');

const TIER_VALUES = ['good', 'better', 'best', 'undecided', 'none'];
const TIER_LABELS = { good: 'Good', better: 'Better', best: 'Best', undecided: 'Not sure yet', none: 'Not needed' };

const OWNERSHIP_LABELS = {
  own: 'Owns the land',
  contract: 'Under contract / closing soon',
  searching: 'Still searching for land',
  help: 'Would like help finding land',
};
const ACCESS_LABELS = {
  paved: 'Paved road to the site',
  gravel: 'Gravel or dirt road',
  none: 'No road access yet',
  unsure: 'Not sure',
};
const UTILITY_LABELS = {
  electric: 'Electricity',
  water: 'Municipal water',
  sewer: 'Sewer',
  gas: 'Natural gas',
  internet: 'Internet / fiber',
  none: 'None of these reach the road',
};
const FLOORS_LABELS = {
  '1': 'Single level',
  loft: 'Single level plus a loft',
  '2': 'Two full floors',
};
const FOUNDATION_LABELS = {
  slab: 'Slab on grade',
  basement: 'Full basement',
  crawl: 'Crawl space',
  unsure: 'Not sure yet',
};
const GARAGE_LABELS = { none: 'No garage', '1': 'One-car garage', '2': 'Two-car garage', '3': 'Three or more' };
const YESNO_LABELS = { yes: 'Yes', no: 'No' };
const ELECTRICITY_LABELS = {
  grid: 'Grid only',
  solar: 'Solar with the grid as backup',
  hybrid: 'Grid and solar with battery backup',
  offgrid: 'Fully off-grid',
};
const TIMELINE_LABELS = {
  '3-6mo': '3 to 6 months',
  '6-12mo': '6 to 12 months',
  '12-24mo': '12 to 24 months',
  exploring: 'Just exploring',
};
const BUDGET_LABELS = {
  'under-250k': 'Under 250 thousand',
  '250-400k': '250 to 400 thousand',
  '400-600k': '400 to 600 thousand',
  '600k-1m': '600 thousand to 1 million',
  '1m-plus': 'Over 1 million',
  discuss: 'Would rather discuss it',
};
const CURRENCY_LABELS = { usd: 'US dollars', eur: 'Euros', other: 'Another currency' };

const M2_TO_FT2 = 10.7639;

// The two answers the catalog cannot price today. Flagged, never invented.
const GAPS = {
  bedrooms: 'Bedrooms: the buyer gave a count, but bedrooms are not a priced section in the catalog (bathrooms are). Price by hand.',
  grid_connection: 'Grid connection: the buyer wants a utility connection, and the catalog has no grid-connection item (solar PV and battery storage exist, the hookup does not). For a rural US site this can be a large line. Price by hand.',
};

// ---- small helpers ------------------------------------------------------------
function str(v, max) {
  if (v === undefined || v === null) return '';
  let s = String(v).replace(/\r\n?/g, '\n').trim();
  if (max && s.length > max) s = s.slice(0, max);
  return s;
}
function oneLine(v, max) {
  return str(v, max).replace(/[\r\n]+/g, ' ').trim();
}
function pick(v, allowed) {
  const s = oneLine(v, 40);
  return allowed.includes(s) ? s : '';
}
function num(v, min, max) {
  if (v === '' || v === undefined || v === null) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  if (min !== undefined && n < min) return null;
  if (max !== undefined && n > max) return null;
  return n;
}
function label(map, v) {
  return v ? map[v] || v : '';
}

const SECTION_KEYS = CATALOG.sections.map((s) => s.key);
const SECTION_BY_KEY = Object.fromEntries(CATALOG.sections.map((s) => [s.key, s]));

// ---- normalize ----------------------------------------------------------------
// Turns whatever the browser sent into the stored shape. Unknown keys are
// dropped, enums are checked, numbers are bounded, text is clamped. Never
// throws: a malformed field becomes empty and validation reports it.
function normalizeAnswers(raw) {
  const a = raw && typeof raw === 'object' ? raw : {};
  const site = a.site || {};
  const building = a.building || {};
  const program = a.program || {};
  const sections = a.sections || {};
  const systems = a.systems || {};
  const timeline = a.timeline || {};
  const contact = a.contact || {};

  const utilities = Array.isArray(site.utilities)
    ? site.utilities.map((u) => pick(u, Object.keys(UTILITY_LABELS))).filter(Boolean)
    : [];

  // Area: the buyer typed one unit and saw both. Store what was typed and derive
  // the other so the record is never internally inconsistent.
  const entered = pick(building.area_entered, ['m2', 'ft2']) || 'm2';
  let m2 = num(building.area_m2, 1, 100000);
  let ft2 = num(building.area_ft2, 1, 1000000);
  if (entered === 'ft2' && ft2) m2 = Math.round(ft2 / M2_TO_FT2);
  else if (m2) ft2 = Math.round(m2 * M2_TO_FT2);
  else if (ft2) m2 = Math.round(ft2 / M2_TO_FT2);

  const out = {
    contact: {
      name: oneLine(contact.name, 200),
      phone: oneLine(contact.phone, 64),
    },
    site: {
      country: oneLine(site.country, 100),
      region: oneLine(site.region, 100),
      address: str(site.address, 500),
      ownership: pick(site.ownership, Object.keys(OWNERSHIP_LABELS)),
      access: pick(site.access, Object.keys(ACCESS_LABELS)),
      utilities,
      notes: str(site.notes, 2000),
    },
    building: {
      domes: num(building.domes, 1, 20),
      diameters: oneLine(building.diameters, 200),
      floors: pick(building.floors, Object.keys(FLOORS_LABELS)),
      foundation: pick(building.foundation, Object.keys(FOUNDATION_LABELS)),
      area_m2: m2,
      area_ft2: ft2,
      area_entered: entered,
    },
    program: {
      bedrooms: num(program.bedrooms, 0, 30),
      bathrooms: num(program.bathrooms, 0, 30),
      half_baths: num(program.half_baths, 0, 30),
      garage: pick(program.garage, Object.keys(GARAGE_LABELS)),
      office: pick(program.office, Object.keys(YESNO_LABELS)),
      other_rooms: str(program.other_rooms, 2000),
    },
    sections: {},
    systems: {
      electricity: pick(systems.electricity, Object.keys(ELECTRICITY_LABELS)),
      notes: str(systems.notes, 2000),
    },
    timeline: {
      start: pick(timeline.start, Object.keys(TIMELINE_LABELS)),
      budget: pick(timeline.budget, Object.keys(BUDGET_LABELS)),
      currency: pick(timeline.currency, Object.keys(CURRENCY_LABELS)),
      notes: str(timeline.notes, 5000),
    },
  };
  for (const key of SECTION_KEYS) {
    const v = pick(sections[key], TIER_VALUES);
    if (v) out.sections[key] = v;
  }
  return out;
}

// ---- validate -----------------------------------------------------------------
// What a SUBMISSION needs. A draft can be as empty as it likes.
function validateForSubmit(answers) {
  const missing = [];
  if (!answers.contact.name) missing.push('your name');
  if (!answers.site.country) missing.push('the country');
  if (!answers.site.ownership) missing.push('whether you own the land');
  if (!answers.building.area_m2) missing.push('the total size');
  if (!answers.building.floors) missing.push('the number of floors');
  if (answers.program.bedrooms === null) missing.push('the number of bedrooms');
  if (answers.program.bathrooms === null) missing.push('the number of bathrooms');
  for (const s of CATALOG.sections) {
    if (!answers.sections[s.key]) missing.push(`a level for ${s.title.toLowerCase()}`);
  }
  if (!answers.systems.electricity) missing.push('how the house makes electricity');
  if (!answers.timeline.start) missing.push('a timeline');
  return missing;
}

// ---- gaps ---------------------------------------------------------------------
function unpricedFlags(answers) {
  const flags = [];
  if (answers.program.bedrooms !== null) {
    flags.push({ key: 'bedrooms', value: answers.program.bedrooms, note: GAPS.bedrooms });
  }
  if (answers.systems.electricity && answers.systems.electricity !== 'offgrid') {
    flags.push({ key: 'grid_connection', value: answers.systems.electricity, note: GAPS.grid_connection });
  }
  return flags;
}

// ---- summary ------------------------------------------------------------------
function fmtInt(n) {
  return n === null || n === undefined ? '' : Number(n).toLocaleString('en-US');
}

function tierLine(sectionKey, value) {
  const s = SECTION_BY_KEY[sectionKey];
  if (!value) return `${s.title}: (not answered)`;
  if (value === 'undecided' || value === 'none') {
    const text = value === 'none' ? (s.none_label || 'Not needed') : 'Not sure yet';
    return `${s.title}: ${text}`;
  }
  return `${s.title}: ${TIER_LABELS[value]} (${s.tiers[value].headline})`;
}

// The readable record: one block per part of the form, in the order the buyer
// answered it, with the two unpriced gaps called out inline AND collected at
// the end so whoever runs the estimate cannot miss them.
function composeSummary({ answers, email, provider, unpriced, locale, submittedAt }) {
  const a = answers;
  const flagged = new Set((unpriced || []).map((f) => f.key));
  const lines = [];
  const add = (l) => lines.push(l);
  const field = (name, value) => add(`${name}: ${value || '(not provided)'}`);

  field('Name', a.contact.name);
  field('Email', email);
  field('Phone', a.contact.phone);
  field('Signed in with', provider || 'email');
  if (locale) field('Page locale', locale);
  if (submittedAt) field('Submitted', submittedAt);
  add('');

  add('SITE');
  field('Country', a.site.country);
  field('Region / state', a.site.region);
  field('Address or parcel', a.site.address);
  field('Land', label(OWNERSHIP_LABELS, a.site.ownership));
  field('Access', label(ACCESS_LABELS, a.site.access));
  field('Utilities at the road', a.site.utilities.length ? a.site.utilities.map((u) => UTILITY_LABELS[u]).join(', ') : '');
  if (a.site.notes) add(`Site notes: ${a.site.notes}`);
  add('');

  add('THE BUILDING');
  field('Domes', a.building.domes !== null ? String(a.building.domes) : '');
  field('Approximate diameters', a.building.diameters);
  field('Floors', label(FLOORS_LABELS, a.building.floors));
  field('Foundation', label(FOUNDATION_LABELS, a.building.foundation));
  field('Total size', a.building.area_m2 ? `${fmtInt(a.building.area_m2)} m2 (${fmtInt(a.building.area_ft2)} ft2), entered in ${a.building.area_entered}` : '');
  add('');

  add('THE PROGRAM');
  field('Bedrooms', a.program.bedrooms !== null ? `${a.program.bedrooms}${flagged.has('bedrooms') ? '  [NOT PRICED: no bedroom section in the catalog]' : ''}` : '');
  field('Full bathrooms', a.program.bathrooms !== null ? String(a.program.bathrooms) : '');
  field('Half bathrooms', a.program.half_baths !== null ? String(a.program.half_baths) : '');
  field('Garage', label(GARAGE_LABELS, a.program.garage));
  field('Office', label(YESNO_LABELS, a.program.office));
  if (a.program.other_rooms) add(`Other rooms: ${a.program.other_rooms}`);
  add('');

  const byGroup = new Map();
  for (const s of CATALOG.sections) {
    if (!byGroup.has(s.group)) byGroup.set(s.group, []);
    byGroup.get(s.group).push(s);
  }
  const groupTitle = (key) => {
    const g = CATALOG.groups.find((x) => x.key === key);
    if (g) return g.title.toUpperCase();
    return key === 'systems' ? 'COMFORT SYSTEMS' : key === 'energy' ? 'ENERGY' : key.toUpperCase();
  };
  for (const key of ['kitchen_bath', 'interior', 'exterior', 'water_outdoors']) {
    add(`${groupTitle(key)} (good / better / best)`);
    for (const s of byGroup.get(key) || []) add(tierLine(s.key, a.sections[s.key]));
    add('');
  }

  add('SYSTEMS');
  for (const s of byGroup.get('systems') || []) add(tierLine(s.key, a.sections[s.key]));
  field('Electricity', a.systems.electricity ? `${ELECTRICITY_LABELS[a.systems.electricity]}${flagged.has('grid_connection') ? '  [NOT PRICED: no grid-connection item in the catalog]' : ''}` : '');
  for (const s of byGroup.get('energy') || []) add(tierLine(s.key, a.sections[s.key]));
  if (a.systems.notes) add(`Systems notes: ${a.systems.notes}`);
  add('');

  add('TIMELINE AND BUDGET');
  field('Wants to start', label(TIMELINE_LABELS, a.timeline.start));
  field('Budget range', a.timeline.budget ? `${BUDGET_LABELS[a.timeline.budget]}${a.timeline.currency ? ` (${CURRENCY_LABELS[a.timeline.currency]})` : ''}` : '');
  add('');
  add('Anything else:');
  add(a.timeline.notes || '(none)');

  if (unpriced && unpriced.length) {
    add('');
    add('NOT YET PRICED (flagged, not invented)');
    for (const f of unpriced) add(`- ${f.note}`);
  }
  return lines.join('\n');
}

module.exports = {
  CATALOG,
  SECTION_KEYS,
  TIER_VALUES,
  TIER_LABELS,
  OWNERSHIP_LABELS,
  ACCESS_LABELS,
  UTILITY_LABELS,
  FLOORS_LABELS,
  FOUNDATION_LABELS,
  GARAGE_LABELS,
  ELECTRICITY_LABELS,
  TIMELINE_LABELS,
  BUDGET_LABELS,
  CURRENCY_LABELS,
  GAPS,
  M2_TO_FT2,
  normalizeAnswers,
  validateForSubmit,
  unpricedFlags,
  composeSummary,
};
