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
const validateEmail = require('../validate-email');

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
    assert.strictEqual(m.to, 'christophergarner2@gmail.com');
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

  // ---- email deliverability checks (api/validate-email.js) ----
  // Stubs DNS at the module boundary (leads.dnsResolveMx/4/6), same pattern
  // as the fetch/SMTP stubs above. No real network in this suite.
  const dnsOriginal = {
    resolveMx: leads.dnsResolveMx,
    resolve4: leads.dnsResolve4,
    resolve6: leads.dnsResolve6,
  };
  function restoreDns() {
    leads.dnsResolveMx = dnsOriginal.resolveMx;
    leads.dnsResolve4 = dnsOriginal.resolve4;
    leads.dnsResolve6 = dnsOriginal.resolve6;
  }

  // 16. Disposable domain -> blocked
  {
    const res = await run(validateEmail, 'POST', { email: 'test@mailinator.com' });
    assert.strictEqual(res.statusCode, 200, 'advisory endpoint: always 200, never a hard block');
    assert.strictEqual(res.body.ok, false);
    assert.strictEqual(res.body.reason, 'disposable');
    assert.strictEqual(res.body.error, 'Please use a permanent email address.');
    ok('validate-email: disposable domain blocked');
  }

  // 17. Mainstream domain with a real MX -> allowed
  {
    leads.dnsResolveMx = async function (domain) {
      assert.strictEqual(domain, 'gmail.com');
      return [{ exchange: 'gmail-smtp-in.l.google.com', priority: 5 }];
    };
    const res = await run(validateEmail, 'POST', { email: 'ada@gmail.com' });
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.body, { ok: true });
    restoreDns();
    ok('validate-email: mainstream domain with MX allowed');
  }

  // 18. Confirmed no-MX (empty MX, and no A/AAAA either) -> blocked
  {
    leads.dnsResolveMx = async function () { return []; };
    leads.dnsResolve4 = async function () {
      const err = new Error('no record'); err.code = 'ENODATA'; throw err;
    };
    leads.dnsResolve6 = async function () {
      const err = new Error('no record'); err.code = 'ENODATA'; throw err;
    };
    const res = await run(validateEmail, 'POST', { email: 'nobody@no-mail-here.example' });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.ok, false);
    assert.strictEqual(res.body.reason, 'no-mx');
    assert.strictEqual(
      res.body.error,
      'That email domain does not appear to accept mail. Please check the spelling.'
    );
    restoreDns();
    ok('validate-email: confirmed no-MX and no A/AAAA blocked');
  }

  // 19. DNS timeout -> indeterminate -> fails open (accepted), never blocks a real lead
  {
    leads.dnsResolveMx = function () {
      return new Promise(function () { /* never resolves: simulates a hung resolver */ });
    };
    const savedTimeout = leads.MX_TIMEOUT_MS;
    leads.MX_TIMEOUT_MS = 30; // keep the suite fast; production default is ~3s
    const res = await run(validateEmail, 'POST', { email: 'someone@slow-dns-example.test' });
    leads.MX_TIMEOUT_MS = savedTimeout;
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.body, { ok: true }, 'timeout is indeterminate, so it must pass');
    restoreDns();
    ok('validate-email: DNS timeout fails open (accepted)');
  }

  // 20. Malformed address -> blocked
  {
    const res = await run(validateEmail, 'POST', { email: 'not-an-email' });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.ok, false);
    assert.strictEqual(res.body.reason, 'invalid');
    assert.strictEqual(res.body.error, 'Please enter a valid email address.');
    ok('validate-email: malformed address blocked');
  }

  // 21. Method/OPTIONS guard, same shape as contact/subscribe
  {
    const optRes = mockRes();
    await validateEmail(mockReq('OPTIONS', {}), optRes);
    assert.strictEqual(optRes.statusCode, 204, 'validate-email OPTIONS -> 204');

    const getRes = mockRes();
    await validateEmail(mockReq('GET', {}), getRes);
    assert.strictEqual(getRes.statusCode, 405, 'validate-email GET -> 405');
    ok('validate-email: OPTIONS 204 / non-POST 405');
  }

  // ---- profanity filter on the Name field (api/validate-email.js) ----
  // Short-circuits before the email deliverability check, so no DNS stub is
  // needed for the blocked cases; the email address is a placeholder only.

  // 22. Profanity in name -> blocked
  {
    const res = await run(validateEmail, 'POST', { email: 'test@example.com', name: 'Fuck You' });
    assert.strictEqual(res.statusCode, 200, 'advisory shape: always 200');
    assert.strictEqual(res.body.ok, false);
    assert.strictEqual(res.body.reason, 'profanity');
    assert.strictEqual(res.body.error, 'Please enter your real name.');
    ok('validate-email: profanity in name blocked');
  }

  // 23. Leetspeak-obfuscated variant -> still blocked
  {
    const res = await run(validateEmail, 'POST', { email: 'test@example.com', name: 'sh1t head' });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.ok, false);
    assert.strictEqual(res.body.reason, 'profanity');
    ok('validate-email: leetspeak-obfuscated name blocked');
  }

  // 24. Ordinary surname that merely CONTAINS a flagged substring -> NOT
  // blocked (the "Scunthorpe problem"). Reaches the real email check, so
  // the domain is stubbed to a confirmed MX like test 17.
  {
    leads.dnsResolveMx = async function (domain) {
      assert.strictEqual(domain, 'gmail.com');
      return [{ exchange: 'gmail-smtp-in.l.google.com', priority: 5 }];
    };
    const res = await run(validateEmail, 'POST', { email: 'jane@gmail.com', name: 'Jane Scunthorpe' });
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.body, { ok: true });
    restoreDns();
    ok('validate-email: ordinary surname containing a flagged substring not blocked');
  }

  // 25. Clean name -> allowed
  {
    leads.dnsResolveMx = async function (domain) {
      assert.strictEqual(domain, 'gmail.com');
      return [{ exchange: 'gmail-smtp-in.l.google.com', priority: 5 }];
    };
    const res = await run(validateEmail, 'POST', { email: 'ada@gmail.com', name: 'Ada Lovelace' });
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.body, { ok: true });
    restoreDns();
    ok('validate-email: clean name allowed');
  }

  // 26. Email-only behaviour is unchanged: no `name` field at all still
  // behaves exactly like before this feature existed, for both the allowed
  // and the blocked email paths.
  {
    leads.dnsResolveMx = async function (domain) {
      assert.strictEqual(domain, 'gmail.com');
      return [{ exchange: 'gmail-smtp-in.l.google.com', priority: 5 }];
    };
    const res = await run(validateEmail, 'POST', { email: 'ada@gmail.com' });
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.body, { ok: true });
    restoreDns();

    const invalidRes = await run(validateEmail, 'POST', { email: 'not-an-email' });
    assert.strictEqual(invalidRes.statusCode, 200);
    assert.strictEqual(invalidRes.body.ok, false);
    assert.strictEqual(invalidRes.body.reason, 'invalid');
    ok('validate-email: email-only behaviour unchanged (no name field)');
  }

  // 27. Name-only payload: this is exactly what the Google and LinkedIn
  // buttons post, since the address only arrives from the provider later.
  // A clean name must return ok:true. Regression guard: this used to fall
  // through to checkEmailDeliverable(''), come back reason:'invalid', and
  // stop both OAuth buttons from ever reaching signInWithOAuth().
  {
    const res = await run(validateEmail, 'POST', { name: 'Ada Lovelace' });
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.body, { ok: true });

    // A dirty name on the same no-email path must still be blocked.
    const dirty = await run(validateEmail, 'POST', { name: 'shit head' });
    assert.strictEqual(dirty.statusCode, 200);
    assert.strictEqual(dirty.body.ok, false);
    assert.strictEqual(dirty.body.reason, 'profanity');
    ok('validate-email: name-only OAuth payload allowed, dirty name still blocked');
  }

  delete process.env.FORM_HMAC_SECRET;

  console.log('\nAll ' + passed + ' lead-capture checks passed.');
})().catch(function (err) {
  console.error('\nTEST FAILED:', err && err.message);
  console.error(err);
  process.exit(1);
});
