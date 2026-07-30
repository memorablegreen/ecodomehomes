// POST /api/validate-email  -- checks an email address (and, optionally, a
// name) before the pricing calculator's sign-in flow calls signInWithOtp().
// Advisory only for the email side: any failure on our side (rate limit,
// bad body, DNS trouble) resolves { ok: true } so a real sign-in is never
// blocked by our own check (see api/_lib/leads.js checkEmailDeliverable).
// The name check is a hard block (not fail-open): a name is either clean or
// it isn't, there is no indeterminate/network-dependent case for it.

'use strict';

const leads = require('./_lib/leads');

const MESSAGES = {
  disposable: 'Please use a permanent email address.',
  'no-mx': 'That email domain does not appear to accept mail. Please check the spelling.',
  invalid: 'Please enter a valid email address.',
  profanity: 'Please enter your real name.',
};

async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return leads.sendJson(res, 405, { ok: false, error: 'Method not allowed' });
  }

  // Best-effort per-IP rate limit (per-lambda-instance; see _lib/leads.js).
  // Fail open: a rate-limited request just skips the check for this email,
  // it never blocks the sign-in itself.
  if (leads.rateLimited(req)) {
    return leads.sendJson(res, 200, { ok: true });
  }

  let data;
  try {
    data = await leads.readJsonBody(req);
  } catch (e) {
    console.error('validate-email: invalid request body, failing open:', e && e.message);
    return leads.sendJson(res, 200, { ok: true });
  }

  const email = leads.clean(data.email, 320).toLowerCase();
  const name = leads.clean(data.name, 200);

  if (name && leads.containsProfanity(name)) {
    return leads.sendJson(res, 200, { ok: false, reason: 'profanity', error: MESSAGES.profanity });
  }

  try {
    const result = await leads.checkEmailDeliverable(email);
    if (result.ok) {
      return leads.sendJson(res, 200, { ok: true });
    }
    return leads.sendJson(res, 200, {
      ok: false,
      reason: result.reason,
      error: MESSAGES[result.reason] || MESSAGES.invalid,
    });
  } catch (e) {
    console.error('validate-email: check failed, failing open:', e && e.message);
    return leads.sendJson(res, 200, { ok: true });
  }
}

module.exports = handler;
