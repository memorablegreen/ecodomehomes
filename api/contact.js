// POST /api/contact  -- EcoDomeHomes "Request information" lead form.
// Creates/updates the lead in GoHighLevel (with a labeled note carrying every
// rich field) and emails Chris a formatted copy. Returns { ok: true } when the
// lead is captured in at least one place.

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

  let data;
  try {
    data = await leads.readJsonBody(req);
  } catch (e) {
    return leads.sendJson(res, 400, { ok: false, error: 'Invalid request body' });
  }

  // Honeypot: real users never fill this. Pretend success, do nothing.
  if (leads.clean(data.company_website, 200)) {
    return leads.sendJson(res, 200, { ok: true });
  }

  const name = leads.clean(data.name, 200);
  const email = leads.clean(data.email, 320).toLowerCase();
  const phone = leads.clean(data.phone, 64);
  const country = leads.clean(data.country, 100);
  const configuration = leads.clean(data.configuration, 60);
  const tier = leads.clean(data.tier, 60);
  const size = leads.clean(data.size, 60);
  const timeline = leads.clean(data.timeline, 60);
  const site = leads.clean(data.site, 60);
  const message = leads.clean(data.message, 5000);

  // Required: name, email, configuration, build tier.
  if (!name || !leads.isValidEmail(email) || !configuration || !tier) {
    return leads.sendJson(res, 400, {
      ok: false,
      error: 'Please provide your name, a valid email, a configuration, and a build level.',
    });
  }

  const configLabel = leads.labelFor(leads.CONFIGURATION_LABELS, configuration);
  const tierLabel = leads.labelFor(leads.TIER_LABELS, tier);
  const sizeLabel = leads.labelFor(leads.SIZE_LABELS, size);
  const timelineLabel = leads.labelFor(leads.TIMELINE_LABELS, timeline);
  const siteLabel = leads.labelFor(leads.SITE_LABELS, site);

  const lines = [
    `Name: ${name}`,
    `Email: ${email}`,
    `Phone: ${phone || '(not provided)'}`,
    `Country: ${country || '(not provided)'}`,
    `Configuration of interest: ${configLabel || '(not provided)'}`,
    `Build level: ${tierLabel || '(not provided)'}`,
    `Approximate size: ${sizeLabel || '(not provided)'}`,
    `Target timeline: ${timelineLabel || '(not provided)'}`,
    `Owns the site: ${siteLabel || '(not provided)'}`,
    '',
    'Message:',
    message || '(none)',
  ];
  const summary = lines.join('\n');

  const { firstName, lastName } = leads.splitName(name);
  let captured = false;

  // 1) GoHighLevel
  if (leads.ghlConfigured()) {
    try {
      const contactId = await leads.upsertGhlContact({
        firstName,
        lastName,
        name,
        email,
        phone,
        source: 'EcoDomeHomes website',
        tags: ['website-contact', 'ecodomehomes'],
      });
      captured = true;
      try {
        const noteBody = `EcoDomeHomes website inquiry\n\n${summary}`;
        await leads.addGhlNote(contactId, noteBody);
      } catch (noteErr) {
        console.error('contact: GHL note failed:', noteErr && noteErr.message);
      }
    } catch (ghlErr) {
      console.error('contact: GHL upsert failed:', ghlErr && ghlErr.message);
    }
  } else {
    console.error('contact: GHL not configured (GHL_PIT_TOKEN / GHL_LOCATION_ID missing)');
  }

  // 2) Email alert to Chris
  if (leads.smtpConfigured()) {
    try {
      await leads.sendLeadEmail({
        subject: `New EcoDomeHomes lead: ${name}`,
        text: `A new inquiry came in through the EcoDomeHomes contact form.\n\n${summary}\n`,
        replyTo: email,
      });
      captured = true;
    } catch (mailErr) {
      console.error('contact: lead email failed:', mailErr && mailErr.message);
    }
  } else {
    console.error('contact: SMTP not configured (SMTP_HOST / SMTP_USER / SMTP_PASS missing)');
  }

  if (!captured) {
    return leads.sendJson(res, 502, {
      ok: false,
      error: 'We could not submit your inquiry. Please email EcoDomeHomes@memorablegreen.com.',
    });
  }
  return leads.sendJson(res, 200, { ok: true });
}

module.exports = handler;
