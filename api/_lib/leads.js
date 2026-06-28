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
  readJsonBody,
  sendJson,
};
