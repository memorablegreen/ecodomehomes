// /api/intake  -- the buyer intake form's save, resume and submit endpoint.
//
//   GET  /api/intake                    -> { ok, draft: { step, answers, updated_at } | null }
//   POST /api/intake { action: 'save',   step, answers }          -> { ok, saved_at }
//   POST /api/intake { action: 'submit', answers, consent, locale } -> { ok, id }
//
// Every call carries the buyer's Supabase session as a Bearer token. The user
// is verified against Supabase Auth and the email is taken from THAT, never
// from the body, so nobody can read or write someone else's intake. The table
// (assistant.edh_intakes) is server-only: no RLS policy lets the browser at it,
// so the service role here is the only path in, which is the same shape as the
// existing lead capture (see api/_lib/leads.js persistSubmission).
//
// On submit the record is stored first, so nothing is lost even if GHL and the
// email both fail, then the contact is upserted into GoHighLevel with the
// summary as a note, then the owner gets the readable summary by email. The
// form never calculates a price and this endpoint never returns one.

'use strict';

const leads = require('./_lib/leads');
const intake = require('./_lib/intake');

const PROFILE_HEADERS = { 'Accept-Profile': 'assistant', 'Content-Profile': 'assistant' };

function supabaseHeaders(extra) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return Object.assign(
    { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    PROFILE_HEADERS,
    extra || {}
  );
}

// Verify the caller against Supabase Auth. Mirrors api/estimate-email.js.
async function verifiedUser(token) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !token) return null;
  const res = await fetch(`${url}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const body = await res.json().catch(() => null);
  if (!body || !body.id || !body.email) return null;
  return {
    id: String(body.id),
    email: String(body.email).toLowerCase(),
    provider: (body.app_metadata && body.app_metadata.provider) || 'email',
    meta: body.user_metadata || {},
  };
}

async function loadDraft(userId) {
  const url = process.env.SUPABASE_URL;
  const qs = new URLSearchParams({
    select: 'id,step,answers,updated_at',
    user_id: `eq.${userId}`,
    status: 'eq.draft',
    limit: '1',
  });
  const res = await fetch(`${url}/rest/v1/edh_intakes?${qs}`, { headers: supabaseHeaders() });
  if (!res.ok) throw new Error(`edh_intakes read failed (${res.status}): ${(await res.text().catch(() => '')).slice(0, 300)}`);
  const rows = await res.json();
  return rows[0] || null;
}

// Insert-or-update the one open draft. The partial unique index on
// (user_id) where status = 'draft' is what "one draft per buyer" hangs on.
async function upsertDraft(user, patch) {
  const url = process.env.SUPABASE_URL;
  const existing = await loadDraft(user.id);
  if (existing) {
    const res = await fetch(`${url}/rest/v1/edh_intakes?id=eq.${encodeURIComponent(existing.id)}`, {
      method: 'PATCH',
      headers: supabaseHeaders({ Prefer: 'return=representation' }),
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error(`edh_intakes update failed (${res.status}): ${(await res.text().catch(() => '')).slice(0, 300)}`);
    return (await res.json())[0];
  }
  const row = Object.assign(
    { user_id: user.id, email: user.email, provider: user.provider, status: 'draft' },
    patch
  );
  const res = await fetch(`${url}/rest/v1/edh_intakes`, {
    method: 'POST',
    headers: supabaseHeaders({ Prefer: 'return=representation' }),
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`edh_intakes insert failed (${res.status}): ${(await res.text().catch(() => '')).slice(0, 300)}`);
  return (await res.json())[0];
}

async function patchRow(id, patch) {
  const url = process.env.SUPABASE_URL;
  const res = await fetch(`${url}/rest/v1/edh_intakes?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: supabaseHeaders({ Prefer: 'return=minimal' }),
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`edh_intakes patch failed (${res.status}): ${(await res.text().catch(() => '')).slice(0, 300)}`);
}

function bearer(req) {
  const auth = String((req.headers && req.headers.authorization) || '');
  return auth.replace(/^Bearer\s+/i, '').trim();
}

async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return leads.sendJson(res, 405, { ok: false, error: 'Method not allowed' });
  }
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (!leads.supabaseConfigured()) {
    console.error('intake: Supabase not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing)');
    return leads.sendJson(res, 502, { ok: false, error: 'Saving is not available right now.' });
  }

  let user;
  try {
    user = await verifiedUser(bearer(req));
  } catch (e) {
    user = null;
  }
  if (!user) return leads.sendJson(res, 401, { ok: false, error: 'Please sign in again.' });

  // ---- GET: resume ----
  if (req.method === 'GET') {
    try {
      const draft = await loadDraft(user.id);
      return leads.sendJson(res, 200, {
        ok: true,
        draft: draft ? { step: draft.step, answers: draft.answers, updated_at: draft.updated_at } : null,
      });
    } catch (e) {
      console.error('intake: load failed:', e && e.message);
      return leads.sendJson(res, 502, { ok: false, error: 'Could not load your saved answers.' });
    }
  }

  // ---- POST ----
  if (leads.rateLimited(req)) {
    return leads.sendJson(res, 429, { ok: false, error: 'Too many requests. Please wait a moment.' });
  }
  let data;
  try {
    data = await leads.readJsonBody(req);
  } catch (e) {
    return leads.sendJson(res, 400, { ok: false, error: 'Invalid request body' });
  }
  const action = leads.clean(data.action, 20);
  const answers = intake.normalizeAnswers(data.answers);
  const locale = leads.clean(data.locale, 8).toLowerCase() || null;

  if (action === 'save') {
    const step = Math.max(0, Math.min(50, Number(data.step) || 0));
    try {
      const row = await upsertDraft(user, {
        step,
        answers,
        name: answers.contact.name || null,
        phone: answers.contact.phone || null,
        unpriced: intake.unpricedFlags(answers),
        catalog_version: intake.CATALOG.catalog_version,
        locale,
      });
      return leads.sendJson(res, 200, { ok: true, saved_at: row.updated_at });
    } catch (e) {
      console.error('intake: save failed:', e && e.message);
      return leads.sendJson(res, 502, { ok: false, error: "Couldn't save just now. Your answers are still on this page." });
    }
  }

  if (action !== 'submit') {
    return leads.sendJson(res, 400, { ok: false, error: 'Unknown action' });
  }

  const missing = intake.validateForSubmit(answers);
  if (missing.length) {
    return leads.sendJson(res, 400, { ok: false, error: `Still needed: ${missing.join(', ')}.`, missing });
  }

  const name = answers.contact.name;
  const phone = answers.contact.phone;
  const email = user.email;
  const unpriced = intake.unpricedFlags(answers);
  const nowIso = new Date().toISOString();

  const consent = leads.consentRecords({
    consent: data.consent,
    source: 'intake',
    email,
    phone: phone || null,
    req,
  });

  // 0) Store the record first, so a GHL or SMTP failure never loses it.
  let row;
  try {
    row = await upsertDraft(user, {
      status: 'submitted',
      submitted_at: nowIso,
      step: 99,
      answers,
      name,
      phone: phone || null,
      unpriced,
      catalog_version: intake.CATALOG.catalog_version,
      locale,
      postal_code: null,
      marketing_email_consent: consent.emailGranted,
      marketing_consent_at: data.consent ? nowIso : null,
      consent_region: consent.region,
    });
  } catch (e) {
    console.error('intake: store failed:', e && e.message);
    return leads.sendJson(res, 502, { ok: false, error: 'We could not save your answers. Please try again, or email EcoDomeHomes@memorablegreen.com.' });
  }
  try {
    await leads.persistConsent(consent.rows);
  } catch (e) {
    console.error('intake: consent record failed:', e && e.message);
  }

  const summary = intake.composeSummary({
    answers,
    email,
    provider: user.provider,
    unpriced,
    locale,
    submittedAt: nowIso,
  });
  const { firstName, lastName } = leads.splitName(name);
  const followUp = {};

  // 1) GoHighLevel, the same way the pricing-tool leads land there.
  if (leads.ghlConfigured()) {
    try {
      const contactId = await leads.upsertGhlContact({
        firstName,
        lastName,
        name,
        email,
        phone,
        source: 'EcoDomeHomes intake form',
        tags: ['EDH Online Lead', 'edh-intake', 'ecodomehomes'].concat(consent.tags),
        dndSettings: consent.dndSettings,
      });
      followUp.ghl_contact_id = contactId;
      followUp.ghl_synced = true;
      try {
        await leads.addGhlNote(contactId, `EcoDomeHomes intake form\n\n${summary}`);
      } catch (noteErr) {
        console.error('intake: GHL note failed:', noteErr && noteErr.message);
      }
    } catch (ghlErr) {
      console.error('intake: GHL upsert failed:', ghlErr && ghlErr.message);
    }
  } else {
    console.error('intake: GHL not configured (GHL_PIT_TOKEN / GHL_LOCATION_ID missing)');
  }

  // 2) The readable summary to the owner, subject in the house pattern.
  if (leads.smtpConfigured()) {
    try {
      await leads.sendLeadEmail({
        subject: `New EcoDomeHomes intake: ${name}`,
        text: `A buyer completed the EcoDomeHomes intake form. The estimate is run by hand from this; nothing below is priced.\n\n${summary}\n`,
        replyTo: email,
      });
      followUp.notified = true;
    } catch (mailErr) {
      console.error('intake: summary email failed:', mailErr && mailErr.message);
    }
  } else {
    console.error('intake: SMTP not configured (SMTP_HOST / SMTP_USER / SMTP_PASS missing)');
  }

  if (Object.keys(followUp).length) {
    try {
      await patchRow(row.id, followUp);
    } catch (e) {
      console.error('intake: follow-up patch failed:', e && e.message);
    }
  }

  return leads.sendJson(res, 200, { ok: true, id: row.id });
}

module.exports = handler;
