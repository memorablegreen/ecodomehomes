// POST /api/subscribe  -- EcoDomeHomes newsletter signup (updates page).
// Upserts the subscriber into GoHighLevel (tagged newsletter) and emails Chris.

'use strict';

const leads = require('./_lib/leads');

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
  if (leads.rateLimited(req)) {
    return leads.sendJson(res, 429, {
      ok: false,
      error: 'Too many requests. Please wait a minute and try again.',
    });
  }

  let data;
  try {
    data = await leads.readJsonBody(req);
  } catch (e) {
    return leads.sendJson(res, 400, { ok: false, error: 'Invalid request body' });
  }

  // Honeypot.
  if (leads.clean(data.company_website, 200)) {
    return leads.sendJson(res, 200, { ok: true });
  }

  // Signed-token gate: only an explicitly PRESENT-but-invalid/expired token is
  // rejected. Missing token (or no FORM_HMAC_SECRET) is accepted (fail open).
  if (leads.formTokenRejected(leads.clean(data.form_token, 400))) {
    return leads.sendJson(res, 400, { ok: false, error: 'Invalid or expired form token.' });
  }

  const email = leads.clean(data.email, 320).toLowerCase();
  if (!leads.isValidEmail(email)) {
    return leads.sendJson(res, 400, { ok: false, error: 'Please provide a valid email address.' });
  }

  let captured = false;

  // 0) Durable Supabase store (safety net so a signup is never lost even if
  // GHL and SMTP both fail).
  if (leads.supabaseConfigured()) {
    try {
      await leads.persistSubmission({
        id: leads.newId('edh-subscribe'),
        source: 'edh-subscribe',
        name: null,
        email,
        phone: null,
        slug: null,
        payload: { list: 'newsletter' },
      });
      captured = true;
    } catch (dbErr) {
      console.error('subscribe: Supabase store failed:', dbErr && dbErr.message);
    }
  } else {
    console.error('subscribe: Supabase not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing)');
  }

  if (leads.ghlConfigured()) {
    try {
      const contactId = await leads.upsertGhlContact({
        firstName: '',
        lastName: '',
        name: '',
        email,
        source: 'EcoDomeHomes website',
        tags: ['newsletter', 'ecodomehomes'],
      });
      captured = true;
      try {
        const noteBody = `Newsletter signup from the EcoDomeHomes updates page.\n\nEmail: ${email}`;
        await leads.addGhlNote(contactId, noteBody);
      } catch (noteErr) {
        console.error('subscribe: GHL note failed:', noteErr && noteErr.message);
      }
    } catch (ghlErr) {
      console.error('subscribe: GHL upsert failed:', ghlErr && ghlErr.message);
    }
  } else {
    console.error('subscribe: GHL not configured (GHL_PIT_TOKEN / GHL_LOCATION_ID missing)');
  }

  if (leads.smtpConfigured()) {
    try {
      await leads.sendLeadEmail({
        subject: `New newsletter signup: ${email}`,
        text: `A new newsletter signup came in through the EcoDomeHomes updates page.\n\nEmail: ${email}\n`,
        replyTo: email,
      });
      captured = true;
    } catch (mailErr) {
      console.error('subscribe: lead email failed:', mailErr && mailErr.message);
    }
  } else {
    console.error('subscribe: SMTP not configured (SMTP_HOST / SMTP_USER / SMTP_PASS missing)');
  }

  if (!captured) {
    return leads.sendJson(res, 502, {
      ok: false,
      error: 'We could not complete your signup. Please try again later.',
    });
  }
  return leads.sendJson(res, 200, { ok: true });
}

module.exports = handler;
