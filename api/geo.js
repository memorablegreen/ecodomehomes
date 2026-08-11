// GET /api/geo  -- tells js/consent.js which consent regime a visitor falls under.
//
// Marketing email is opt-in in the EEA, the UK and Switzerland (GDPR +
// ePrivacy), Canada (CASL) and Brazil (LGPD): nothing may be sent without a
// positive, unticked-by-default act. In the US and most of the rest of the
// world it is opt-out (CAN-SPAM), so a clear notice is enough.
//
// Location, not language: a German speaker reading /de/ from Texas is opt_out,
// and an American reading the English root page from Lisbon is opt_in. The
// locale a visitor happens to be browsing says nothing about which law applies.
//
// FAIL SAFE: no header, an unknown country, or any error at all resolves to
// opt_in, the strict treatment. Being wrong in that direction costs a marketing
// contact. Being wrong the other way is a regulatory problem.

'use strict';

const leads = require('./_lib/leads');

// EEA (27) + Iceland, Liechtenstein, Norway + United Kingdom + Switzerland,
// then Canada and Brazil. Mirrored in js/consent.js so the client still
// classifies correctly if it only ever sees a country code.
const OPT_IN_COUNTRIES = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU',
  'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES',
  'SE', 'IS', 'LI', 'NO', 'GB', 'CH', 'CA', 'BR',
]);

function countryFrom(req) {
  const headers = (req && req.headers) || {};
  const raw =
    headers['x-vercel-ip-country'] ||
    headers['cf-ipcountry'] ||
    '';
  const country = String(raw).trim().toUpperCase();
  // Vercel uses XX for addresses it cannot place.
  if (!country || country === 'XX' || country.length !== 2) return '';
  return country;
}

async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return leads.sendJson(res, 405, { ok: false, error: 'Method not allowed' });
  }

  const country = countryFrom(req);
  const region = country && !OPT_IN_COUNTRIES.has(country) ? 'opt_out' : 'opt_in';

  // Per-visitor answer, so never let a shared CDN cache hand one country's
  // verdict to the next visitor. That single mistake would silently show the
  // US notice to European visitors.
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  return leads.sendJson(res, 200, { country: country || null, region });
}

module.exports = handler;
