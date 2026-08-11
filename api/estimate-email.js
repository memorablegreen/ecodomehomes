// POST /api/estimate-email  -- emails a signed-in visitor their own estimate.
//
// The "Email me my estimate" button had never been wired to anything: it showed
// "Sent to <address>" and sent nothing at all, on all seven pricing pages.
//
// This is a TRANSACTIONAL email. The visitor asked for their own figure, so it
// needs no marketing consent and is deliberately kept separate from the opt-in
// captured at sign-in (see js/consent.js). It carries no marketing content.
//
// The recipient is ALWAYS taken from the verified Supabase session, never from
// the request body, so this endpoint cannot be used to mail an arbitrary
// address. The figures come from the page as already-rendered, already-localised
// display strings: that guarantees the email shows exactly what the visitor was
// looking at, and it keeps 7 locales' worth of number formatting out of here.

'use strict';

const leads = require('./_lib/leads');

// Minimal chrome per locale. Everything numeric arrives pre-rendered.
const COPY = {
  en: {
    subject: 'Your EcoDomeHomes estimate',
    hello: 'Hi',
    intro: 'Here is the estimate you built on our pricing page.',
    rangeNote: 'Final quotes vary by region, site conditions and finish level.',
    cta: 'Pick up where you left off',
    outro: 'Reply to this email if you would like to talk it through.',
    team: 'EcoDomeHomes by Memorable Green',
  },
  de: {
    subject: 'Ihre EcoDomeHomes-Schätzung',
    hello: 'Hallo',
    intro: 'Hier ist die Schätzung, die Sie auf unserer Preisseite erstellt haben.',
    rangeNote: 'Endgültige Angebote variieren je nach Region, Baugrund und Ausstattung.',
    cta: 'Dort weitermachen, wo Sie aufgehört haben',
    outro: 'Antworten Sie einfach auf diese E-Mail, wenn Sie darüber sprechen möchten.',
    team: 'EcoDomeHomes von Memorable Green',
  },
  es: {
    subject: 'Su estimación de EcoDomeHomes',
    hello: 'Hola',
    intro: 'Esta es la estimación que ha creado en nuestra página de precios.',
    rangeNote: 'Los presupuestos finales varían según la región, el terreno y el nivel de acabado.',
    cta: 'Continuar donde lo dejó',
    outro: 'Responda a este correo si quiere que lo comentemos.',
    team: 'EcoDomeHomes de Memorable Green',
  },
  fr: {
    subject: 'Votre estimation EcoDomeHomes',
    hello: 'Bonjour',
    intro: 'Voici l’estimation que vous avez construite sur notre page tarifs.',
    rangeNote: 'Les devis définitifs varient selon la région, le terrain et le niveau de finition.',
    cta: 'Reprendre où vous en étiez',
    outro: 'Répondez à cet e-mail si vous souhaitez en discuter.',
    team: 'EcoDomeHomes par Memorable Green',
  },
  nl: {
    subject: 'Uw EcoDomeHomes-schatting',
    hello: 'Hallo',
    intro: 'Dit is de schatting die u op onze prijzenpagina hebt samengesteld.',
    rangeNote: 'Definitieve offertes verschillen per regio, terrein en afwerkingsniveau.',
    cta: 'Verder waar u gebleven was',
    outro: 'Reageer op deze e-mail als u erover wilt praten.',
    team: 'EcoDomeHomes van Memorable Green',
  },
  pt: {
    subject: 'A sua estimativa EcoDomeHomes',
    hello: 'Olá',
    intro: 'Esta é a estimativa que construiu na nossa página de preços.',
    rangeNote: 'Os orçamentos finais variam consoante a região, o terreno e o nível de acabamento.',
    cta: 'Continuar onde ficou',
    outro: 'Responda a este email se quiser falar sobre isto.',
    team: 'EcoDomeHomes da Memorable Green',
  },
};

const LOCALE_PATH = { en: '', de: '/de', es: '/es', fr: '/fr', nl: '/nl', pt: '/pt', us: '/us' };

function copyFor(locale) {
  if (locale === 'us') return COPY.en;
  return COPY[locale] || COPY.en;
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Verify the caller against Supabase and take the address from the token, not
// from anything the browser sent.
async function verifiedUser(token) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !token) return null;
  const res = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: key, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const body = await res.json().catch(() => null);
  if (!body || !body.email) return null;
  return { email: String(body.email), meta: body.user_metadata || {} };
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
  if (leads.rateLimited(req)) {
    return leads.sendJson(res, 429, { ok: false, error: 'Too many requests. Please wait a moment.' });
  }

  let data;
  try {
    data = await leads.readJsonBody(req);
  } catch (e) {
    return leads.sendJson(res, 400, { ok: false, error: 'Invalid request body' });
  }

  const auth = String((req.headers && req.headers.authorization) || '');
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  let user;
  try {
    user = await verifiedUser(token);
  } catch (e) {
    user = null;
  }
  if (!user) {
    return leads.sendJson(res, 401, { ok: false, error: 'Please sign in again.' });
  }

  if (!leads.smtpConfigured()) {
    console.error('estimate-email: SMTP not configured (SMTP_HOST / SMTP_USER / SMTP_PASS missing)');
    return leads.sendJson(res, 502, { ok: false, error: 'Could not send right now.' });
  }

  const locale = leads.clean(data.locale, 8).toLowerCase();
  const t = copyFor(locale);

  // Pre-rendered display strings, clamped. Never interpolated as HTML.
  const number = leads.clean(data.number, 60);
  const range = leads.clean(data.range, 160);
  const config = leads.clean(data.config, 160);
  const detail = leads.clean(data.detail, 200);
  const total = leads.clean(data.total, 60);
  if (!number) {
    return leads.sendJson(res, 400, { ok: false, error: 'Nothing to send.' });
  }

  const firstName = leads.clean(user.meta.full_name || user.meta.name || '', 80).split(/\s+/)[0];
  const greeting = firstName ? `${t.hello} ${firstName},` : `${t.hello},`;
  const link = `https://www.ecodomehomes.com${LOCALE_PATH[locale] === undefined ? '' : LOCALE_PATH[locale]}/pricing`;

  const text = [
    greeting,
    '',
    t.intro,
    '',
    config,
    detail,
    '',
    number,
    range,
    total ? `(${total})` : '',
    '',
    t.rangeNote,
    '',
    `${t.cta}: ${link}`,
    '',
    t.outro,
    '',
    t.team,
    'ecodomehomes.com',
  ].filter(function (line) { return line !== ''; }).join('\n');

  const html = `<div style="font-family:-apple-system,system-ui,Segoe UI,Inter,sans-serif;max-width:520px;margin:0 auto;color:#1F2419;line-height:1.6;">
  <p>${escapeHtml(greeting)}</p>
  <p>${escapeHtml(t.intro)}</p>
  <div style="background:#f7f7f2;border-radius:14px;padding:22px 24px;margin:22px 0;">
    <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#5b6152;">${escapeHtml(config)}</p>
    <p style="margin:0 0 14px;font-size:13px;color:#8a8f80;">${escapeHtml(detail)}</p>
    <p style="margin:0;font-size:38px;font-weight:800;color:#2F4527;">${escapeHtml(number)}</p>
    <p style="margin:6px 0 0;font-size:13.5px;color:#5b6152;">${escapeHtml(range)}</p>
    ${total ? `<p style="margin:10px 0 0;font-size:13px;color:#8a8f80;">${escapeHtml(total)}</p>` : ''}
  </div>
  <p style="font-size:13.5px;color:#5b6152;">${escapeHtml(t.rangeNote)}</p>
  <p style="margin:26px 0;"><a href="${escapeHtml(link)}" style="background:#1A936F;color:#fff;text-decoration:none;padding:13px 22px;border-radius:10px;font-weight:700;display:inline-block;">${escapeHtml(t.cta)}</a></p>
  <p style="font-size:14px;">${escapeHtml(t.outro)}</p>
  <p style="font-size:13px;color:#8a8f80;margin-top:28px;">${escapeHtml(t.team)}<br><a href="https://www.ecodomehomes.com" style="color:#8a8f80;">ecodomehomes.com</a></p>
</div>`;

  try {
    await leads.sendVisitorEmail({ to: user.email, subject: t.subject, text, html });
  } catch (mailErr) {
    console.error('estimate-email: send failed:', mailErr && mailErr.message);
    return leads.sendJson(res, 502, { ok: false, error: 'Could not send right now.' });
  }

  return leads.sendJson(res, 200, { ok: true, to: user.email });
}

module.exports = handler;
