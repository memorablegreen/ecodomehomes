// GET /api/form-token  -- issues a short-lived signed token for the lead forms.
// js/contact-form.js fetches this and echoes the token back in the POST body so
// api/contact.js / api/subscribe.js can raise the cost of blind direct-POST bots.
//
// Anti-abuse only, never a gate: when FORM_HMAC_SECRET is unset this returns an
// empty token and the POST handlers accept submissions that carry no token.

'use strict';

const leads = require('./_lib/leads');

async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return leads.sendJson(res, 405, { ok: false, error: 'Method not allowed' });
  }
  // Tokens are short-lived and per-request; never let a CDN or browser cache them.
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  return leads.sendJson(res, 200, { token: leads.issueFormToken() });
}

module.exports = handler;
