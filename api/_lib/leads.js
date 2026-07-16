// Shared helpers for the EcoDomeHomes lead-capture functions (api/contact.js,
// api/subscribe.js). Two side effects per lead: upsert the contact into the
// MG/EDH GoHighLevel CRM, and email Chris a formatted copy.
//
// All secrets come from the environment, never hardcoded:
//   GHL_PIT_TOKEN, GHL_LOCATION_ID  -> GoHighLevel Private Integration Token + location
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS -> Hostinger mailbox (contact@memorablegreen.com)
//
// Functions are referenced through module.exports so tests can swap the two true
// I/O boundaries (global.fetch for GHL, createTransport for SMTP) without touching
// the validation, mapping, request-building, or email-composition logic.

'use strict';

const crypto = require('node:crypto');

const GHL_BASE = 'https://services.leadconnectorhq.com';
const GHL_VERSION = '2021-07-28';
// GoHighLevel sits behind Cloudflare and rejects requests without a browser
// User-Agent with a 1010 / 403. This header is required, not optional.
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) ecodomehomes-web';

const LEAD_INBOX = 'EcoDomeHomes@memorablegreen.com';

// ---- value -> human label maps (form values are English codes on every locale) ----
const CONFIGURATION_LABELS = {
  family: 'The Family (single-family residence)',
  coastal: 'The Coastal (oceanfront pavilion)',
  compound: 'The Compound (multi-dome)',
  agricultural: 'Agricultural / M45 Agri-Tech',
  commercial: 'Commercial / M45 Systems',
  other: 'Other / undecided',
};
const TIER_LABELS = {
  watertight: 'Watertight shell (structure, foundation, windows, doors)',
  builder: 'Builder grade (turnkey, move-in ready)',
  custom: 'Custom (premium finishes, custom architecture)',
  unsure: 'Not sure yet',
};
const SIZE_LABELS = {
  '80-120': '80 to 120 m2',
  '120-180': '120 to 180 m2',
  '180-250': '180 to 250 m2',
  '250-500': '250 to 500 m2 (multi-dome)',
  '500+': '500+ m2 (estate / commercial)',
  undecided: 'Undecided',
};
const TIMELINE_LABELS = {
  '3-6mo': '3 to 6 months',
  '6-12mo': '6 to 12 months',
  '12-24mo': '12 to 24 months',
  exploring: 'Just exploring',
};
const SITE_LABELS = {
  yes: 'Yes, the site is secured',
  contract: 'Under contract / closing soon',
  searching: 'Actively searching',
  no: 'No, would want help with this too',
};

function labelFor(map, value) {
  if (!value) return '';
  return map[value] || String(value);
}

// ---- input hygiene ----
function clean(value, max) {
  if (value === undefined || value === null) return '';
  let s = String(value).trim();
  if (max && s.length > max) s = s.slice(0, max);
  return s;
}

// Collapse newlines for single-line contexts (subject lines, names) to block
// header injection and keep the alert readable.
function oneLine(value) {
  return clean(value, 400).replace(/[\r\n]+/g, ' ').trim();
}

function isValidEmail(email) {
  if (!email || email.length > 320) return false;
  // Deliberately simple and permissive; the real check is the confirmation email.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function splitName(fullName) {
  const name = oneLine(fullName);
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

// ---- GoHighLevel ----
function ghlHeaders() {
  const token = process.env.GHL_PIT_TOKEN;
  return {
    Authorization: `Bearer ${token}`,
    Version: GHL_VERSION,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'User-Agent': BROWSER_UA,
  };
}

function ghlConfigured() {
  return Boolean(process.env.GHL_PIT_TOKEN && process.env.GHL_LOCATION_ID);
}

// Upsert a contact and return its id. country is intentionally NOT sent as the
// GHL country field (that expects an ISO-2 code; the form collects free text),
// so it is preserved in the note instead.
async function upsertGhlContact({ firstName, lastName, name, email, phone, source, tags }) {
  const payload = {
    locationId: process.env.GHL_LOCATION_ID,
    name: oneLine(name),
    firstName: oneLine(firstName),
    lastName: oneLine(lastName),
    email,
    source: source || 'EcoDomeHomes website',
    tags: tags || [],
  };
  if (phone) payload.phone = phone;

  const res = await fetch(`${GHL_BASE}/contacts/upsert`, {
    method: 'POST',
    headers: ghlHeaders(),
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`GHL upsert failed (${res.status}): ${text.slice(0, 300)}`);
  }
  let data = {};
  try {
    data = JSON.parse(text);
  } catch (e) {
    data = {};
  }
  const id = (data.contact && data.contact.id) || data.id || null;
  if (!id) throw new Error('GHL upsert returned no contact id');
  return id;
}

async function addGhlNote(contactId, body) {
  const res = await fetch(`${GHL_BASE}/contacts/${contactId}/notes`, {
    method: 'POST',
    headers: ghlHeaders(),
    body: JSON.stringify({ body }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GHL note failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return true;
}

// ---- email (Hostinger SMTP via nodemailer) ----
function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

// Lazy-require so the module loads (and `node --check` passes) without nodemailer
// present, and so tests can override module.exports.createTransport.
function createTransport() {
  const nodemailer = require('nodemailer');
  const port = Number(process.env.SMTP_PORT) || 465;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

// Send the internal lead alert. Self-BCCs the sending mailbox per house rule.
async function sendLeadEmail({ subject, text, replyTo }) {
  const user = process.env.SMTP_USER;
  const transport = module.exports.createTransport();
  const mail = {
    from: `"EcoDomeHomes Website" <${user}>`,
    to: LEAD_INBOX,
    bcc: user,
    subject: oneLine(subject),
    text,
  };
  if (replyTo) mail.replyTo = replyTo;
  return transport.sendMail(mail);
}

// ---- durable Supabase store (safety net: assistant.website_submissions) ----
// A lead is never lost even if GHL and SMTP both fail: it is persisted here
// first. Same table/pattern as the memorablegreen site endpoints. Awaited by
// callers before they respond (a Vercel Lambda can freeze right after the
// response, dropping any in-flight fetch).
function supabaseConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function newId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function persistSubmission(row) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetch(`${url}/rest/v1/website_submissions`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Content-Profile': 'assistant',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`website_submissions insert failed (${res.status}): ${text.slice(0, 300)}`);
  }
}

// ---- anti-abuse: signed form token + per-IP rate limit ----
// GUIDING PRINCIPLE: never block a real lead. Both mechanisms fail OPEN. The
// honeypot is bypassable by a scraper that reads api/README.md and POSTs direct;
// these raise the cost of that without gating a genuine same-origin submission.

const FORM_TOKEN_TTL_MS = 2 * 60 * 60 * 1000; // ~2 hours

function formSecret() {
  return process.env.FORM_HMAC_SECRET || '';
}

let warnedNoSecret = false;

// Mint "<issuedAtMs>.<hmacSha256(issuedAtMs)>". Returns '' when no secret is set,
// which the front end treats as "no token" (fail open).
function issueFormToken() {
  const secret = formSecret();
  if (!secret) return '';
  const iat = String(Date.now());
  const sig = crypto.createHmac('sha256', secret).update(iat).digest('hex');
  return iat + '.' + sig;
}

// Returns true ONLY when a token is explicitly present but forged or expired.
// Missing token, or no secret configured, returns false (accept) on purpose.
function formTokenRejected(token) {
  const secret = formSecret();
  if (!secret) {
    if (!warnedNoSecret) {
      console.warn('form-token: FORM_HMAC_SECRET not set, skipping token check (accepting all)');
      warnedNoSecret = true;
    }
    return false; // (a) secret unset -> skip the check entirely
  }
  if (!token) return false; // (b) no token present at all -> fail open
  const parts = String(token).split('.');
  if (parts.length !== 2 || !/^\d+$/.test(parts[0])) return true;
  const iat = parts[0];
  const expected = crypto.createHmac('sha256', secret).update(iat).digest('hex');
  let sigBuf;
  let expBuf;
  try {
    sigBuf = Buffer.from(parts[1], 'hex');
    expBuf = Buffer.from(expected, 'hex');
  } catch (e) {
    return true;
  }
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return true;
  const age = Date.now() - Number(iat);
  if (age < 0 || age > FORM_TOKEN_TTL_MS) return true; // expired or future-dated
  return false; // valid and fresh -> accept
}

// Best-effort, per-lambda-instance rate limit. A serverless deployment runs many
// concurrent instances, each with its own Map, so this is a soft speed bump for
// blind direct-POST bots, never a hard guarantee or a gate on real traffic.
//
// clientIp() below trusts x-forwarded-for at face value, so a per-IP cap alone
// is trivially defeated by a bot that sends a fresh spoofed IP on every request.
// GLOBAL_RATE_LIMIT_MAX is a per-instance backstop across all IPs that an XFF
// spoof cannot touch: it caps total submissions per instance per window, raising
// the real cost of a blind-POST flood even when every request claims a new IP.
const RATE_LIMIT_MAX = 5; // POSTs per IP
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // per minute
const GLOBAL_RATE_LIMIT_MAX = 30; // POSTs per instance, across all IPs, per window
const rateHits = new Map(); // ip -> [timestampMs, ...]
let globalHits = []; // timestampMs[], across all IPs

function clientIp(req) {
  const xff = req && req.headers && req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return (req && req.socket && req.socket.remoteAddress) || 'unknown';
}

function rateLimited(req) {
  const now = Date.now();

  globalHits = globalHits.filter(function (t) {
    return now - t < RATE_LIMIT_WINDOW_MS;
  });
  globalHits.push(now);
  if (globalHits.length > GLOBAL_RATE_LIMIT_MAX) return true;

  const ip = clientIp(req);
  const recent = (rateHits.get(ip) || []).filter(function (t) {
    return now - t < RATE_LIMIT_WINDOW_MS;
  });
  recent.push(now);
  rateHits.set(ip, recent);
  return recent.length > RATE_LIMIT_MAX;
}

// Test-only hook so the offline suite can isolate rate-limit cases.
function _resetRateLimit() {
  rateHits.clear();
  globalHits = [];
}

// ---- body parsing ----
async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body.length) {
    try {
      return JSON.parse(req.body);
    } catch (e) {
      return {};
    }
  }
  let raw = '';
  try {
    for await (const chunk of req) raw += chunk;
  } catch (e) {
    return {};
  }
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (e) {
    return {};
  }
}

function sendJson(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(obj));
}

module.exports = {
  CONFIGURATION_LABELS,
  TIER_LABELS,
  SIZE_LABELS,
  TIMELINE_LABELS,
  SITE_LABELS,
  labelFor,
  clean,
  oneLine,
  isValidEmail,
  splitName,
  ghlConfigured,
  smtpConfigured,
  upsertGhlContact,
  addGhlNote,
  createTransport,
  sendLeadEmail,
  supabaseConfigured,
  newId,
  persistSubmission,
  readJsonBody,
  sendJson,
  issueFormToken,
  formTokenRejected,
  rateLimited,
  _resetRateLimit,
};
