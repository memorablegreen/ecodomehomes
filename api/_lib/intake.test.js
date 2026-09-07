// Offline dry-run for the intake endpoint. Same shape as leads.test.js: the
// real I/O boundaries are stubbed (global.fetch for Supabase Auth, the
// edh_intakes REST table and GoHighLevel; leads.createTransport for SMTP) and
// everything else, normalization, validation, the gap flags, the summary and
// the handler's sequencing, runs for real.
//
// Run: node api/_lib/intake.test.js
//
// NOT UI verification. This proves the record and the notification are
// correctly FORMED; whether a buyer can drive the form is proved by walking
// intake.html in a browser (docs/intake.md).

'use strict';

process.env.SUPABASE_URL = 'https://supabase.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test';
process.env.SUPABASE_ANON_KEY = 'anon-test';
process.env.GHL_PIT_TOKEN = 'test-token';
process.env.GHL_LOCATION_ID = 'test-location';
process.env.SMTP_HOST = 'smtp.example.com';
process.env.SMTP_PORT = '465';
process.env.SMTP_USER = 'contact@memorablegreen.com';
process.env.SMTP_PASS = 'test-pass';

const assert = require('node:assert');
const leads = require('./leads');
const intake = require('./intake');
const handler = require('../intake');

let fetchCalls = [];
let sentMail = [];
let table = []; // fake assistant.edh_intakes
let idSeq = 1;

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) };
}

global.fetch = async function (url, opts) {
  url = String(url);
  opts = opts || {};
  const method = opts.method || 'GET';
  const body = opts.body ? JSON.parse(opts.body) : null;
  fetchCalls.push({ url, method, body, headers: opts.headers || {} });

  if (url.startsWith('https://supabase.test/auth/v1/user')) {
    const auth = (opts.headers && opts.headers.Authorization) || '';
    if (auth === 'Bearer good-jwt') return jsonResponse(200, { id: 'user-1', email: 'Buyer@Example.com', app_metadata: { provider: 'email' }, user_metadata: {} });
    return jsonResponse(401, { error: 'bad jwt' });
  }
  if (url.startsWith('https://supabase.test/rest/v1/edh_intakes')) {
    assert.strictEqual(opts.headers['Accept-Profile'], 'assistant', 'assistant schema on every table call');
    const u = new URL(url);
    if (method === 'GET') {
      const uid = (u.searchParams.get('user_id') || '').replace('eq.', '');
      const status = (u.searchParams.get('status') || '').replace('eq.', '');
      return jsonResponse(200, table.filter((r) => r.user_id === uid && r.status === status));
    }
    if (method === 'POST') {
      // The column defaults the migration declares, so the fake behaves like the table.
      const row = Object.assign({ id: `row-${idSeq++}`, status: 'draft', step: 0, ghl_synced: false, notified: false, marketing_email_consent: false, updated_at: '2026-09-07T10:00:00Z' }, body);
      table.push(row);
      return jsonResponse(201, [row]);
    }
    if (method === 'PATCH') {
      const id = (u.searchParams.get('id') || '').replace('eq.', '');
      const row = table.find((r) => r.id === id);
      Object.assign(row, body, { updated_at: '2026-09-07T10:05:00Z' });
      return jsonResponse(200, [row]);
    }
  }
  if (url.startsWith('https://supabase.test/rest/v1/edh_consents')) return jsonResponse(201, {});
  if (url.endsWith('/contacts/upsert')) return jsonResponse(200, { contact: { id: 'contact_777' } });
  if (url.includes('/notes')) return jsonResponse(200, {});
  return jsonResponse(404, { error: 'unexpected ' + url });
};

leads.createTransport = function () {
  return { sendMail: async (mail) => { sentMail.push(mail); return { messageId: 'stub' }; } };
};

function reset() {
  fetchCalls = [];
  sentMail = [];
  table = [];
  leads._resetRateLimit();
}
function mockReq(method, body, jwt) {
  return { method, headers: { 'content-type': 'application/json', authorization: jwt ? `Bearer ${jwt}` : '' }, body };
}
function mockRes() {
  const res = { statusCode: 200, headers: {}, body: null, headersSent: false };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.end = (s) => { res.body = s ? JSON.parse(s) : null; res.headersSent = true; };
  return res;
}

// A complete, realistic set of answers: the Michigan buyer from the brief.
function fullAnswers() {
  const sections = {};
  for (const s of intake.CATALOG.sections) sections[s.key] = 'better';
  sections.kitchen = 'best';
  sections.shutters = 'none';
  sections.rainwater = 'undecided';
  return {
    contact: { name: 'Jordan Miller', phone: '+1 616 555 0100' },
    site: { country: 'United States', region: 'Michigan', address: 'Looking near Traverse City', ownership: 'searching', access: 'gravel', utilities: ['electric', 'internet'], notes: 'Wooded, some slope.' },
    building: { domes: 1, diameters: 'about 14 m', floors: 'loft', foundation: 'slab', area_ft2: 1600, area_entered: 'ft2' },
    program: { bedrooms: 3, bathrooms: 2, half_baths: 1, garage: '2', office: 'yes', other_rooms: 'Mudroom' },
    sections,
    systems: { electricity: 'hybrid', notes: 'EV charger in the garage.' },
    timeline: { start: '6-12mo', budget: '400-600k', currency: 'usd', notes: 'Want to frame the lake view.' },
  };
}

(async function run() {
  // ---- normalize + flags + summary --------------------------------------------
  {
    const a = intake.normalizeAnswers(fullAnswers());
    assert.strictEqual(a.building.area_m2, 149, 'ft2 entry derives m2');
    assert.strictEqual(a.building.area_ft2, 1600);
    assert.strictEqual(a.sections.kitchen, 'best');
    assert.strictEqual(a.sections.shutters, 'none');
    assert.strictEqual(intake.validateForSubmit(a).length, 0, 'complete answers validate');

    const flags = intake.unpricedFlags(a);
    assert.deepStrictEqual(flags.map((f) => f.key), ['bedrooms', 'grid_connection'], 'both catalog gaps flagged');

    const text = intake.composeSummary({ answers: a, email: 'buyer@example.com', provider: 'email', unpriced: flags, locale: 'us', submittedAt: '2026-09-07T10:00:00.000Z' });
    assert.ok(text.includes('Kitchen: Best (Built around cooking)'), 'tier line carries level and headline');
    assert.ok(text.includes('Shutters: No shutters'), 'none renders its label');
    assert.ok(text.includes('Rainwater: Not sure yet'), 'undecided renders');
    assert.ok(text.includes('Bedrooms: 3  [NOT PRICED'), 'bedroom gap inline');
    assert.ok(text.includes('Electricity: Grid and solar with battery backup  [NOT PRICED'), 'grid gap inline');
    assert.ok(text.includes('NOT YET PRICED (flagged, not invented)'), 'gap block at the end');
    assert.ok(text.includes('149 m2 (1,600 ft2)'), 'both units in the summary');
    assert.ok(!/[€$]|\bEUR\b|\bUSD\b/.test(text), 'summary carries no currency figure');
    assert.ok(!/[–—]/.test(text), 'summary has no dashes');
  }
  {
    // Off-grid: no grid-connection flag. Junk is dropped, not stored.
    const raw = fullAnswers();
    raw.systems.electricity = 'offgrid';
    raw.sections.kitchen = 'platinum';
    raw.program.bedrooms = 400;
    raw.extra = { hack: true };
    const a = intake.normalizeAnswers(raw);
    assert.deepStrictEqual(intake.unpricedFlags(a).map((f) => f.key), [], 'off-grid + no bedrooms -> no flags');
    assert.ok(!('kitchen' in a.sections), 'unknown tier value dropped');
    assert.strictEqual(a.program.bedrooms, null, 'out-of-range count dropped');
    assert.ok(!('extra' in a), 'unknown top-level key dropped');
    const missing = intake.validateForSubmit(a);
    assert.ok(missing.includes('the number of bedrooms') && missing.includes('a level for kitchen'), 'validation names what is missing');
  }

  // ---- handler: auth -------------------------------------------------------------
  {
    reset();
    const res = mockRes();
    await handler(mockReq('GET', null, 'bad-jwt'), res);
    assert.strictEqual(res.statusCode, 401, 'bad token rejected');
    assert.strictEqual(table.length, 0);
  }
  {
    reset();
    const res = mockRes();
    await handler(mockReq('GET', null, ''), res);
    assert.strictEqual(res.statusCode, 401, 'no token rejected');
  }

  // ---- handler: save, resume, save again (one draft) ------------------------------
  {
    reset();
    let res = mockRes();
    await handler(mockReq('GET', null, 'good-jwt'), res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.draft, null, 'no draft yet');

    const partial = { contact: { name: 'Jordan Miller' }, site: { country: 'United States', ownership: 'searching' } };
    res = mockRes();
    await handler(mockReq('POST', { action: 'save', step: 1, answers: partial }, 'good-jwt'), res);
    assert.strictEqual(res.statusCode, 200, 'save ok');
    assert.strictEqual(table.length, 1, 'one draft row');
    assert.strictEqual(table[0].status, 'draft');
    assert.strictEqual(table[0].email, 'buyer@example.com', 'email from the verified session, lowercased');
    assert.strictEqual(table[0].name, 'Jordan Miller', 'name column mirrors answers');
    assert.strictEqual(table[0].step, 1);
    assert.strictEqual(table[0].catalog_version, intake.CATALOG.catalog_version, 'answers stamped with the catalog version');

    res = mockRes();
    await handler(mockReq('POST', { action: 'save', step: 4, answers: Object.assign(partial, { sections: { kitchen: 'good' } }) }, 'good-jwt'), res);
    assert.strictEqual(table.length, 1, 'second save updates, does not insert');
    assert.strictEqual(table[0].step, 4);
    assert.strictEqual(table[0].answers.sections.kitchen, 'good');

    res = mockRes();
    await handler(mockReq('GET', null, 'good-jwt'), res);
    assert.strictEqual(res.body.draft.step, 4, 'resume returns the saved step');
    assert.strictEqual(res.body.draft.answers.contact.name, 'Jordan Miller', 'resume returns the answers');
    assert.strictEqual(sentMail.length, 0, 'a draft sends no email');
    assert.ok(!fetchCalls.some((c) => c.url.includes('leadconnectorhq')), 'a draft touches no CRM');
  }

  // ---- handler: submit incomplete ------------------------------------------------
  {
    reset();
    const res = mockRes();
    await handler(mockReq('POST', { action: 'submit', answers: { contact: { name: 'X' } } }, 'good-jwt'), res);
    assert.strictEqual(res.statusCode, 400, 'incomplete submit rejected');
    assert.ok(/Still needed/.test(res.body.error));
    assert.strictEqual(table.length, 0, 'nothing stored');
    assert.strictEqual(sentMail.length, 0);
  }

  // ---- handler: submit complete --------------------------------------------------
  {
    reset();
    // Start from a saved draft, the way a real buyer arrives here.
    let res = mockRes();
    await handler(mockReq('POST', { action: 'save', step: 9, answers: fullAnswers() }, 'good-jwt'), res);
    res = mockRes();
    await handler(mockReq('POST', {
      action: 'submit',
      answers: fullAnswers(),
      locale: 'us',
      consent: { version: 'edh-consent-v1', locale: 'us', region: 'opt_out', marketingEmail: true, marketingEmailMethod: 'notice', marketingEmailText: 'notice text', pageUrl: 'https://www.ecodomehomes.com/intake' },
    }, 'good-jwt'), res);
    assert.strictEqual(res.statusCode, 200, 'submit ok: ' + JSON.stringify(res.body));
    assert.deepStrictEqual(Object.keys(res.body).sort(), ['id', 'ok'], 'response carries the id and nothing that looks like a price');

    assert.strictEqual(table.length, 1, 'the draft became the submission, no second row');
    const row = table[0];
    assert.strictEqual(row.status, 'submitted');
    assert.ok(row.submitted_at, 'submitted_at stamped');
    assert.strictEqual(row.ghl_contact_id, 'contact_777');
    assert.strictEqual(row.ghl_synced, true);
    assert.strictEqual(row.notified, true);
    assert.strictEqual(row.marketing_email_consent, true, 'opt-out region notice recorded as granted');
    assert.strictEqual(row.consent_region, 'opt_out');
    assert.deepStrictEqual(row.unpriced.map((f) => f.key), ['bedrooms', 'grid_connection'], 'gaps stored on the record');
    assert.strictEqual(row.answers.sections.kitchen, 'best');
    assert.ok(!JSON.stringify(row.answers).match(/cost|price|€|\$/), 'stored answers carry no price');

    const upsert = fetchCalls.find((c) => c.url.endsWith('/contacts/upsert'));
    assert.ok(upsert, 'GHL upsert made');
    assert.strictEqual(upsert.body.email, 'buyer@example.com');
    assert.strictEqual(upsert.body.firstName, 'Jordan');
    assert.strictEqual(upsert.body.lastName, 'Miller');
    assert.strictEqual(upsert.body.phone, '+1 616 555 0100');
    assert.strictEqual(upsert.body.source, 'EcoDomeHomes intake form');
    assert.deepStrictEqual(upsert.body.tags, ['EDH Online Lead', 'edh-intake', 'ecodomehomes', 'edh-optin-yes'], 'tagged like the pricing leads, plus intake');
    const note = fetchCalls.find((c) => c.url.includes('/contacts/contact_777/notes'));
    assert.ok(note && note.body.body.startsWith('EcoDomeHomes intake form'), 'summary attached as a GHL note');
    assert.ok(note.body.body.includes('NOT YET PRICED'), 'note carries the gaps');

    const consentCall = fetchCalls.find((c) => c.url.includes('/edh_consents'));
    assert.ok(consentCall, 'consent record written');
    assert.strictEqual(consentCall.body[0].source, 'intake');

    assert.strictEqual(sentMail.length, 1, 'one owner email');
    const m = sentMail[0];
    assert.strictEqual(m.subject, 'New EcoDomeHomes intake: Jordan Miller', 'subject in the house pattern');
    assert.strictEqual(m.to, 'christophergarner2@gmail.com', 'lands in the lead inbox');
    assert.strictEqual(m.replyTo, 'buyer@example.com', 'reply goes to the buyer');
    assert.ok(m.text.includes('Michigan'), 'email carries the site');
    assert.ok(m.text.includes('Kitchen: Best (Built around cooking)'), 'email carries the tiers');
    assert.ok(m.text.includes('[NOT PRICED'), 'email carries the gaps inline');
    assert.ok(!/[€$]/.test(m.text), 'email carries no price');

    // A new save after submission starts a fresh draft; the submission is untouched.
    res = mockRes();
    await handler(mockReq('POST', { action: 'save', step: 0, answers: { contact: { name: 'Jordan Miller' } } }, 'good-jwt'), res);
    assert.strictEqual(table.length, 2, 'post-submit save opens a new draft');
    assert.strictEqual(table[0].status, 'submitted', 'submitted row untouched');
  }

  // ---- handler: partial failures never lose the record ----------------------------
  {
    reset();
    const realFetch = global.fetch;
    global.fetch = async function (url, opts) {
      if (String(url).endsWith('/contacts/upsert')) return jsonResponse(500, { error: 'ghl down' });
      return realFetch(url, opts);
    };
    leads.createTransport = function () { return { sendMail: async () => { throw new Error('smtp down'); } }; };
    const res = mockRes();
    await handler(mockReq('POST', { action: 'submit', answers: fullAnswers() }, 'good-jwt'), res);
    assert.strictEqual(res.statusCode, 200, 'record stored, so the buyer still sees success');
    assert.strictEqual(table[0].status, 'submitted');
    assert.strictEqual(table[0].ghl_synced, false);
    assert.strictEqual(table[0].notified, false, 'notified stays false so the miss is visible in the table');
    global.fetch = realFetch;
  }

  console.log('intake tests: all passed');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
