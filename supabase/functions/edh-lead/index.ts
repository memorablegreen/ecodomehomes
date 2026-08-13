import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const json = (b, s = 200) => new Response(JSON.stringify(b), {
  status: s,
  headers: { ...cors, 'Content-Type': 'application/json' }
});

const clean = (v, max) => typeof v === 'string' ? v.replace(/[\r\n]+/g, ' ').trim().slice(0, max) : '';

// The site ships these seven locale directories. Anything else (an unknown
// or malformed value, or no value at all -- pages predating this field)
// is dropped rather than stored, so the column only ever holds a locale we
// actually have copy for.
const SITE_LOCALES = ['en', 'us', 'de', 'es', 'fr', 'nl', 'pt'];
function siteLocale(v) {
  const l = clean(v, 8).toLowerCase();
  return SITE_LOCALES.includes(l) ? l : null;
}

// Consent records keep a truncated address, never the full one: enough to
// corroborate the record if it is ever challenged, not enough to identify a
// person. Consistent with the person-level-IP refusal on the analytics side.
function truncateIp(raw) {
  const ip = (raw || '').split(',')[0].trim();
  if (!ip) return null;
  if (ip.includes('.')) {
    const p = ip.split('.');
    return p.length === 4 ? `${p[0]}.${p[1]}.${p[2]}.x` : null;
  }
  if (ip.includes(':')) {
    const p = ip.split(':').filter(Boolean);
    return p.length >= 3 ? `${p[0]}:${p[1]}:${p[2]}::x` : null;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  try {
    const authHeader = req.headers.get('Authorization') || '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    if (!jwt) return json({ error: 'no token' }, 401);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const anon = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY'));
    const { data: ud, error: uErr } = await anon.auth.getUser(jwt);
    if (uErr || !ud?.user) return json({ error: 'unauthorized' }, 401);
    const user = ud.user;

    const email = user.email || '';
    const md = user.user_metadata || {};
    const provider = user.app_metadata?.provider || 'email';

    const body = await req.json().catch(() => ({}));
    const estimate = typeof body.estimate === 'number' ? body.estimate : null;
    const config = body.config ?? null;
    const locale = siteLocale(body.locale);

    // Name: prefer what the visitor typed on the pricing page. OAuth metadata is
    // the fallback, and it is EMPTY for email/OTP sign-ups, which is why those
    // leads previously landed in GHL named only by their email address.
    const typedName = clean(body.name, 200);
    const metaName = clean(
      md.full_name || md.name || [md.given_name, md.family_name].filter(Boolean).join(' '),
      200
    );
    const name = typedName || metaName || '';

    // ZIP / postal code: collected on the pricing page, was never forwarded.
    const zip = clean(body.zip ?? body.postal_code ?? body.postalCode, 32);

    // ---- consent ----------------------------------------------------------
    // Shape produced by js/consent.js. Absent entirely when that module failed
    // to load or the page predates it, in which case NOTHING is recorded as
    // granted: no consent beats an invented one.
    const c = body.consent ?? null;
    const consentPresent = !!c && typeof c === 'object';
    const rawMethod = consentPresent ? clean(c.marketingEmailMethod, 32) : '';
    // A decision made BEFORE an OAuth redirect and restored from storage on the
    // way back is a real decision, not a missing one. It is recorded under its
    // own method so the audit trail says how it was captured, and it counts as
    // affirmative everywhere a freshly ticked box would. Getting this wrong
    // discarded the tick silently, and in the data that looks exactly like a
    // visitor who chose not to tick, so nobody would ever have reported it.
    const consentRestored = consentPresent && c.marketingEmailRestored === true;
    const consentMethod = rawMethod === 'checkbox' && consentRestored ? 'checkbox_restored' : rawMethod;
    const affirmative = consentMethod === 'checkbox' || consentMethod === 'checkbox_restored' || consentMethod === 'newsletter_form';
    const consentGranted = consentPresent && c.marketingEmail === true && consentMethod !== 'unavailable' && consentMethod !== '';

    // Server-stamped, never taken from the client: the truncated address and
    // the time.
    const headerCountry = (req.headers.get('cf-ipcountry') || '').toUpperCase();
    const region = consentPresent && (c.region === 'opt_in' || c.region === 'opt_out') ? c.region : null;
    const ipTruncated = truncateIp(req.headers.get('x-forwarded-for') || '');
    const nowIso = new Date().toISOString();

    const admin = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), {
      db: { schema: 'assistant' }
    });

    // GHL upsert every time so the 'EDH Online Lead' tag stays applied
    let ghlId = null;
    try {
      const parts = name.trim().split(/\s+/).filter(Boolean);
      const payload = {
        locationId: Deno.env.get('GHL_LOCATION'),
        email,
        name: name || undefined,
        firstName: parts[0] || undefined,
        lastName: parts.length > 1 ? parts.slice(1).join(' ') : undefined,
        postalCode: zip || undefined,
        tags: ['EDH Online Lead'],
        source: 'EcoDomeHomes pricing tool'
      };
      // GHL is where sending actually happens, so the consent decision has to
      // land HERE or the checkbox is decorative.
      if (consentPresent) {
        payload.tags = [...payload.tags, consentGranted ? 'edh-optin-yes' : 'edh-optin-no'];
        if (!consentGranted) {
          // No consent: hard stop on email so no campaign can reach them.
          payload.dndSettings = {
            Email: { status: 'active', message: 'No marketing consent recorded (EDH sign-in)' }
          };
        } else if (affirmative) {
          // An affirmative tick is a fresh opt-in, so it is right to clear a
          // previous block. Deliberately NOT done for method 'notice': that is
          // an opt-out region's default, and letting a default resurrect
          // someone who had actively unsubscribed is exactly the bug that makes
          // an unsubscribe link meaningless.
          payload.dndSettings = {
            Email: { status: 'inactive', message: 'Opted in on the EDH pricing page' }
          };
        }
      }
      const r = await fetch('https://services.leadconnectorhq.com/contacts/upsert', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${Deno.env.get('GHL_TOKEN')}`,
          Version: '2021-07-28',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      const gj = await r.json().catch(() => ({}));
      ghlId = gj?.contact?.id || gj?.id || null;
    } catch {}

    // log every sign-in so known people's visit history is tracked
    try {
      await admin.from('edh_visits').insert({ user_id: user.id, email, name, provider, estimate });
    } catch {}

    // Consent proof: append-only, one row per decision, storing the verbatim
    // wording this visitor saw in their own language.
    if (consentPresent) {
      try {
        await admin.from('edh_consents').insert([{
          user_id: user.id,
          email,
          purpose: 'marketing_email',
          granted: consentGranted,
          source: 'signin',
          method: consentMethod || null,
          text_version: clean(c.version, 64) || null,
          text_shown: clean(c.marketingEmailText, 2000) || null,
          locale: clean(c.locale, 16) || null,
          region,
          page_url: clean(c.pageUrl, 500) || null,
          ip_truncated: ipTruncated,
          user_agent: (req.headers.get('user-agent') || '').slice(0, 500) || null
        }]);
      } catch {}
    }

    // first sign-in inserts the lead (fires the email); return visits bump the counter
    const { data: existing } = await admin.from('edh_leads').select('id, visits').eq('user_id', user.id).maybeSingle();
    if (!existing) {
      await admin.from('edh_leads').insert({
        user_id: user.id,
        email,
        name,
        postal_code: zip || null,
        provider,
        estimate,
        config,
        locale,
        ghl_contact_id: ghlId,
        ghl_synced: !!ghlId,
        marketing_email_consent: consentGranted,
        marketing_consent_at: consentPresent ? nowIso : null,
        consent_region: region
      });
    } else {
      const patch = { visits: (existing.visits || 1) + 1, last_seen_at: nowIso };
      if (ghlId) { patch.ghl_contact_id = ghlId; patch.ghl_synced = true; }
      if (estimate != null) patch.estimate = estimate;
      if (config != null) patch.config = config;
      if (name) patch.name = name;
      if (zip) patch.postal_code = zip;
      if (locale) patch.locale = locale;
      if (consentPresent) {
        patch.marketing_email_consent = consentGranted;
        patch.marketing_consent_at = nowIso;
        patch.consent_region = region;
      }
      await admin.from('edh_leads').update(patch).eq('user_id', user.id);
    }

    return json({
      ok: true,
      ghl: !!ghlId,
      isNew: !existing,
      consent: consentPresent ? consentGranted : null,
      method: consentMethod || null,
      country: headerCountry || null
    });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
