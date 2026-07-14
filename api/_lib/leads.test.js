// Offline dry-run for the lead-capture handlers. Stubs the two real I/O
// boundaries only: global.fetch (GoHighLevel) and leads.createTransport (SMTP).
// All validation, sanitization, field mapping, request building, and email
// composition runs for real. Run: node api/_lib/leads.test.js

'use strict';

process.env.GHL_PIT_TOKEN = 'test-token';
process.env.GHL_LOCATION_ID = 'test-location';
process.env.SMTP_HOST = 'smtp.example.com';
process.env.SMTP_PORT = '465';
process.env.SMTP_USER = 'contact@memorablegreen.com';
process.env.SMTP_PASS = 'test-pass';

const assert = require('node:assert');
const leads = require('./leads');
const contact = require('../contact');
const subscribe = require('../subscribe');

let fetchCalls = [];
let sentMail = [];

// ---- GoHighLevel stub ----
global.fetch = async function (url, opts) {
  fetchCalls.push({ url: String(url), opts });
  if (String(url).endsWith('/contacts/upsert')) {
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ contact: { id: 'contact_123' } }),
    };
  }
  if (String(url).includes('/notes')) {
    return { ok: true, status: 200, text: async () => '{}' };
  }
  return { ok: false, status: 404, text: async () => 'not found' };
};

// ---- SMTP stub (override the exported factory) ----
leads.createTransport = function () {
  return {
    sendMail: async function (mail) {
      sentMail.push(mail);
      return { messageId: 'stub' };
    },
  };
};

function reset() {
  fetchCalls = [];
  sentMail = [];
  leads._resetRateLimit();
}

function mockReq(method, body) {
  return { method, headers: { 'content-type': 'application/json' }, body };
}

function mockRes() {
  return {
    statusCode: 0,
    headers: {},
    body: null,
    setHeader(k, v) {
      this.headers[k.toLowerCase()] = v;
    },
    end(payload) {
      this.body = payload ? JSON.parse(payload) : null;
    },
  };
}

async function run(handler, method, body) {
  reset();
  const res = mockRes();
  await handler(mockReq(method, body), res);
  return res;
}

let passed = 0;
function ok(label) {
  passed += 1;
  console.log('  PASS  ' + label);
}

(async function main() {
  // 1. Contact happy path
  {
    const res = await run(contact, 'POST', {
      name: 'Ada Lovelace',
      email: 'ADA@Example.com',
      phone: '+1 555 123 4567',
      country: 'USA',
      configuration: 'coastal',
      tier: 'custom',
      size: '180-250',
      timeline: '6-12mo',
      site: 'yes',
      message: 'Oceanfront lot, want a quote.',
    });
    assert.strictEqual(res.statusCode, 200, 'contact happy status');
    assert.deepStrictEqual(res.body, { ok: true }, 'contact happy body');
    assert.strictEqual(fetchCalls.length, 2, 'contact: upsert + note');

    const upsert = JSON.parse(fetchCalls[0].opts.body);
    assert.strictEqual(upsert.firstName, 'Ada');
    assert.strictEqual(upsert.lastName, 'Lovelace');
    assert.strictEqual(upsert.email, 'ada@example.com', 'email lowercased');
    assert.strictEqual(upsert.phone, '+1 555 123 4567');
    assert.deepStrictEqual(upsert.tags, ['website-contact', 'ecodomehomes']);
    assert.strictEqual(upsert.locationId, 'test-location');
    assert.ok(!('country' in upsert), 'country not sent as GHL field');
    // Cloudflare-required browser UA + version header present
    assert.ok(/Mozilla/.test(fetchCalls[0].opts.headers['User-Agent']), 'browser UA sent');
    assert.strictEqual(fetchCalls[0].opts.headers.Version, '2021-07-28');
    assert.ok(/Bearer test-token/.test(fetchCalls[0].opts.headers.Authorization));

    const note = JSON.parse(fetchCalls[1].opts.body).body;
    assert.ok(note.includes('The Coastal'), 'note has configuration label');
    assert.ok(note.includes('Custom'), 'note has tier label');
    assert.ok(note.includes('Country: USA'), 'note has country');
    assert.ok(note.includes('Oceanfront lot'), 'note has message');

    assert.strictEqual(sentMail.length, 1, 'one email sent');
    const m = sentMail[0];
    assert.strictEqual(m.subject, 'New EcoDomeHomes lead: Ada Lovelace');
    assert.strictEqual(m.to, 'EcoDomeHomes@memorablegreen.com');
    assert.strictEqual(m.bcc, 'contact@memorablegreen.com', 'self-BCC');
    assert.strictEqual(m.replyTo, 'ada@example.com');
    assert.ok(m.text.includes('The Coastal'));
    assert.ok(m.text.includes('6 to 12 months'));
    assert.ok(!/[--]/.test(m.text), 'no em/en dashes in email');
    ok('contact happy path (GHL upsert + note + email)');
  }

  // 2. Contact validation: missing name
  {
    const res = await run(contact, 'POST', {
      email: 'x@y.com',
      configuration: 'family',
      tier: 'builder',
    });
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.ok, false);
    assert.strictEqual(fetchCalls.length, 0, 'no GHL on invalid');
    assert.strictEqual(sentMail.length, 0, 'no email on invalid');
    ok('contact validation: missing name -> 400, no side effects');
  }

  // 3. Contact validation: bad email
  {
    const res = await run(contact, 'POST', {
      name: 'Bob',
      email: 'not-an-email',
      configuration: 'family',
      tier: 'builder',
    });
    assert.strictEqual(res.statusCode, 400);
    ok('contact validation: bad email -> 400');
  }

  // 4. Contact honeypot
  {
    const res = await run(contact, 'POST', {
      name: 'Spammy',
      email: 'spam@bot.com',
      configuration: 'family',
      tier: 'builder',
      company_website: 'http://spam.example',
    });
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.body, { ok: true });
    assert.strictEqual(fetchCalls.length, 0, 'honeypot: no GHL');
    assert.strictEqual(sentMail.length, 0, 'honeypot: no email');
    ok('contact honeypot: silent 200, dropped');
  }

  // 5. Contact: GHL fails, email still captures it
  {
    const prev = global.fetch;
    global.fetch = async function () {
      return { ok: false, status: 500, text: async () => 'boom' };
    };
    reset();
    const res = mockRes();
    await contact(mockReq('POST', {
      name: 'Grace Hopper',
      email: 'grace@navy.mil',
      configuration: 'commercial',
      tier: 'unsure',
    }), res);
    global.fetch = prev;
    assert.strictEqual(res.statusCode, 200, 'still ok when email captured');
    assert.strictEqual(sentMail.length, 1, 'email sent despite GHL failure');
    ok('contact partial failure: GHL down, email captures -> 200');
  }

  // 6. Method guard
  {
    const res = await run(contact, 'GET', {});
    assert.strictEqual(res.statusCode, 405);
    ok('contact method guard: GET -> 405');
  }

  // 7. Subscribe happy path
  {
    const res = await run(subscribe, 'POST', { email: 'Reader@Example.com' });
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.body, { ok: true });
    const upsert = JSON.parse(fetchCalls[0].opts.body);
    assert.strictEqual(upsert.email, 'reader@example.com');
    assert.deepStrictEqual(upsert.tags, ['newsletter', 'ecodomehomes']);
    assert.strictEqual(sentMail[0].subject, 'New newsletter signup: reader@example.com');
    assert.strictEqual(sentMail[0].bcc, 'contact@memorablegreen.com');
    ok('subscribe happy path (GHL + email)');
  }

  // 8. Subscribe invalid email
  {
    const res = await run(subscribe, 'POST', { email: 'nope' });
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(fetchCalls.length, 0);
    assert.strictEqual(sentMail.length, 0);
    ok('subscribe validation: bad email -> 400, no side effects');
  }

  // 9. Subscribe honeypot
  {
    const res = await run(subscribe, 'POST', {
      email: 'spam@bot.com',
      company_website: 'filled',
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(fetchCalls.length, 0);
    assert.strictEqual(sentMail.length, 0);
    ok('subscribe honeypot: silent 200, dropped');
  }

  // 10. Anti-abuse: secret unset -> token check skipped (forged token still accepted)
  {
    delete process.env.FORM_HMAC_SECRET;
    const res = await run(contact, 'POST', {
      name: 'Token Skip',
      email: 'skip@example.com',
      configuration: 'family',
      tier: 'builder',
      form_token: 'totally.bogus',
    });
    assert.strictEqual(res.statusCode, 200, 'no secret -> accepted despite forged token');
    assert.strictEqual(sentMail.length, 1, 'lead still captured with secret unset');
    ok('anti-abuse: FORM_HMAC_SECRET unset skips token check (accept)');
  }

  // A secret IS configured from here on.
  process.env.FORM_HMAC_SECRET = 'unit-test-form-secret';

  // 11. Valid token accepted
  {
    const token = leads.issueFormToken();
    assert.ok(/^\d+\.[0-9a-f]+$/.test(token), 'issued token shape');
    const res = await run(contact, 'POST', {
      name: 'Valid Token',
      email: 'valid@example.com',
      configuration: 'family',
      tier: 'builder',
      form_token: token,
    });
    assert.strictEqual(res.statusCode, 200, 'valid token accepted');
    assert.strictEqual(sentMail.length, 1, 'lead captured with valid token');
    ok('anti-abuse: valid token accepted');
  }

  // 12. Forged token rejected (present but invalid -> 400, no side effects)
  {
    const res = await run(contact, 'POST', {
      name: 'Forged Token',
      email: 'forged@example.com',
      configuration: 'family',
      tier: 'builder',
      form_token: String(Date.now()) + '.deadbeefdeadbeef',
    });
    assert.strictEqual(res.statusCode, 400, 'forged token rejected');
    assert.strictEqual(res.body.ok, false);
    assert.strictEqual(fetchCalls.length, 0, 'forged token: no GHL');
    assert.strictEqual(sentMail.length, 0, 'forged token: no email');
    ok('anti-abuse: forged token rejected (400, no lead)');
  }

  // 13. Missing token accepted (fail open) even with a secret set
  {
    const res = await run(subscribe, 'POST', { email: 'notoken@example.com' });
    assert.strictEqual(res.statusCode, 200, 'missing token accepted (fail open)');
    assert.strictEqual(sentMail.length, 1, 'lead captured without a token');
    ok('anti-abuse: missing token accepted (fail open)');
  }

  // 14. Per-IP rate limit: 6th POST/min from one IP -> 429
  {
    leads._resetRateLimit();
    function ipReq(body) {
      return {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' },
        body: body,
      };
    }
    for (let i = 0; i < 5; i++) {
      const r = mockRes();
      await subscribe(ipReq({ email: 'rl' + i + '@example.com' }), r);
      assert.strictEqual(r.statusCode, 200, 'request ' + (i + 1) + ' under the limit');
    }
    const blocked = mockRes();
    await subscribe(ipReq({ email: 'rl-blocked@example.com' }), blocked);
    assert.strictEqual(blocked.statusCode, 429, '6th request rate limited');
    assert.strictEqual(blocked.body.ok, false);
    ok('anti-abuse: per-IP rate limit triggers 429');
  }

  // 15. Global backstop: a flood that spoofs a new IP on every request still
  // trips the per-instance cap once total volume crosses GLOBAL_RATE_LIMIT_MAX,
  // since clientIp() trusts x-forwarded-for and a per-IP-only limit is
  // otherwise trivially bypassed by rotating the header.
  {
    leads._resetRateLimit();
    function spoofedReq(ip, body) {
      return {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
        body: body,
      };
    }
    for (let i = 0; i < 30; i++) {
      const r = mockRes();
      await subscribe(spoofedReq('198.51.100.' + i, { email: 'gl' + i + '@example.com' }), r);
      assert.strictEqual(r.statusCode, 200, 'request ' + (i + 1) + ' under the global cap');
    }
    const blocked = mockRes();
    await subscribe(spoofedReq('198.51.100.250', { email: 'gl-blocked@example.com' }), blocked);
    assert.strictEqual(blocked.statusCode, 429, 'global cap trips even with a fresh spoofed IP');
    ok('anti-abuse: global per-instance rate limit survives IP spoofing');
  }

  delete process.env.FORM_HMAC_SECRET;

  console.log('\nAll ' + passed + ' lead-capture checks passed.');
})().catch(function (err) {
  console.error('\nTEST FAILED:', err && err.message);
  console.error(err);
  process.exit(1);
});
