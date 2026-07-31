// POST /api/proposal-braga-church -- server-side password gate for the
// hidden Braga Church client proposal at /proposals/braga-church.
//
// The document content lives in api/_lib/proposal-braga-church.js, a module
// required ONLY from here. It is never sent to the browser until this
// handler verifies the password server-side, so it is not present in the
// statically served output at all, view-source on the gate page shows only
// the empty shell.
//
// Wrong password and a missing password both return the same generic 401,
// so a client can never learn which part failed.

'use strict';

const crypto = require('node:crypto');
const leads = require('./_lib/leads');
const { PROPOSAL_HTML } = require('./_lib/proposal-braga-church');

const PASSWORD_ENV_VAR = 'PROPOSAL_PW_BRAGA_CHURCH';
const GENERIC_ERROR = 'That password is not correct.';

// Constant-time compare that never throws on a length mismatch: both sides
// are hashed to a fixed 32-byte SHA-256 digest first, so
// crypto.timingSafeEqual always receives two equal-length buffers, whatever
// the length of the submitted password.
function passwordMatches(candidate, expected) {
  const a = crypto.createHash('sha256').update(String(candidate || '')).digest();
  const b = crypto.createHash('sha256').update(String(expected || '')).digest();
  return crypto.timingSafeEqual(a, b);
}

async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return leads.sendJson(res, 405, { ok: false, error: 'Method not allowed' });
  }

  // Never let a CDN or browser cache an auth response, and never let a
  // search engine index the endpoint itself.
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');

  // Best-effort per-IP / per-instance rate limit; same helper api/contact.js
  // uses (see api/_lib/leads.js). Fails open only in the sense that it is a
  // soft, per-instance speed bump, never a hard guarantee, exactly as
  // documented there.
  if (leads.rateLimited(req)) {
    return leads.sendJson(res, 429, {
      ok: false,
      error: 'Too many attempts. Please wait a minute and try again.',
    });
  }

  let data;
  try {
    data = await leads.readJsonBody(req);
  } catch (e) {
    return leads.sendJson(res, 400, { ok: false, error: 'Invalid request.' });
  }

  const password = leads.clean(data.password, 200);
  const expected = process.env[PASSWORD_ENV_VAR];

  if (!expected) {
    console.error(`proposal-braga-church: ${PASSWORD_ENV_VAR} is not set`);
    return leads.sendJson(res, 500, { ok: false, error: 'This page is not available right now.' });
  }

  if (!password || !passwordMatches(password, expected)) {
    return leads.sendJson(res, 401, { ok: false, error: GENERIC_ERROR });
  }

  return leads.sendJson(res, 200, { ok: true, html: PROPOSAL_HTML });
}

module.exports = handler;
