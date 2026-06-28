# EcoDomeHomes analytics and consent

How tracking works on ecodomehomes.com after the Consent Mode v2 upgrade, the
full event catalog, the conversions that matter, and the UTM convention for
links we post off-site.

## Goal

Maximum legal visibility. Every visitor is measured with cookieless, PII-free
tracking that needs no consent, and visitors who accept cookies in the Klaro
banner upgrade to full, cookie-based collection.

## Tools and IDs

| Tool | ID | Consent | What it captures |
|---|---|---|---|
| Google Analytics 4 | `G-2Z8EWMQHZP` | Consent Mode v2 (cookieless until granted) | Page views, custom events, modeled conversions |
| Microsoft Clarity | `wxcquf151a` | Consent API v2 (cookieless until granted) | Session recordings, heatmaps |
| Vercel Web Analytics | per project (script at `/_vercel/insights/script.js`) | Cookieless, no consent needed | Page views, custom events, 100% coverage |
| Vercel Speed Insights | per project (script at `/_vercel/speed-insights/script.js`) | Cookieless, no consent needed | Core Web Vitals (LCP, CLS, INP) |
| LeadConnector chat | widget `6a15b3831ce15bb9e91bedb3` | Functional consent (Klaro gated) | Live chat |

## Consent architecture

1. Before `gtag.js` loads, an ungated inline `<head>` script sets the Consent
   Mode v2 default to denied for `ad_storage`, `analytics_storage`,
   `ad_user_data`, `ad_personalization` (with `wait_for_update: 500`), and tells
   Clarity to run cookieless via `clarity('consentv2', { ad_Storage: 'denied',
   analytics_Storage: 'denied' })`. The same block installs the cookieless
   `window.va` (Web Analytics) and `window.si` (Speed Insights) queue shims.
2. `gtag.js` and the Clarity loader now load for everyone (no longer Klaro
   blocked), so both send cookieless, modeled pings in the denied state. This is
   GDPR-safe without prior consent.
3. When a visitor accepts a service in the Klaro banner, `js/consent-mode.js`
   flips the matching signal to granted:
   - Google Analytics, accept, runs `gtag('consent', 'update', { analytics_storage:
     'granted', ad_storage: 'granted', ad_user_data: 'granted',
     ad_personalization: 'granted' })`.
   - Microsoft Clarity, accept, runs `clarity('consentv2', { ad_Storage: 'granted',
     analytics_Storage: 'granted' })`.
   Declining (or never choosing) leaves the denied/cookieless state.
4. The Klaro toggles for Google Analytics and Clarity are now consent SIGNALS,
   not script blockers. `klaro-config.js` keeps the cookie lists so Klaro can
   clear cookies on decline, and per-service `callback`s trigger the same
   idempotent bridge as a redundant path. LeadConnector chat stays fully Klaro
   gated (functional consent is correct for live chat).

Code: `js/analytics-events.js` (events), `js/consent-mode.js` (Klaro to gtag and
Clarity bridge), `klaro-config.js` (services), and the per-page `<head>` inline
defaults.

## Event catalog

GA4 column = also sent to Google Analytics 4 (may carry richer data such as the
email address or phone number, which never leaves Google and only persists with
consent). Vercel column = also sent to Vercel Web Analytics, always cookieless
and PII-free (only `section`, `language`, `template`, `kind`, `target`, `dest`).

| Event | Fires when | GA4 | Vercel | Conversion |
|---|---|---|---|---|
| `page_view` | Every page load (enriched with language, section, template) | yes | no (Vercel records page views natively) | no |
| `contact_form_submit` | Contact form is submitted | yes | yes | YES |
| `email_click` | Any `mailto:` link is clicked (`kind` = investor or residential) | as `investor_email_click` / `residential_email_click` (with address) | yes (`kind`, no address) | YES |
| `phone_click` | Any `tel:` link is clicked | yes (with number) | yes (no number) | YES |
| `pricing_calculator_engagement` | First interaction with the pricing calculator (once per session) | yes | yes | YES |
| `chatbot_open` | LeadConnector chat widget is opened (best-effort, once per session) | yes | yes | YES |
| `cta_click` | A booking link (cal.eu / cal.com / calendly) or a styled CTA (nav-cta, next-cta, btn-primary/ghost, estimate-cta, press-cta) is clicked | yes (`cta_target`, `cta_dest`) | yes (`target`, `dest`) | YES |

### Key conversions

`contact_form_submit`, `email_click`, `phone_click`, `chatbot_open`,
`cta_click` (target `book_call`), and `pricing_calculator_engagement`.

### Notes and caveats

- `chatbot_open` is a heuristic. The LeadConnector widget runs in a cross-origin
  iframe, so we listen for a `postMessage` from a leadconnector origin whose
  payload signals open/expand. If LeadConnector's event names differ it simply
  will not fire (no false positives). Confirm the real widget event names if
  this under-reports.
- Vercel custom event `data` values stay flat and PII-free by design. Never add
  an email address or phone number to a `vaTrack` call.

## UTM convention for off-site links

Tag every link we post outside the site so GA4 and Vercel attribute the source.
Pattern: `https://ecodomehomes.com/<path>?utm_source=<source>&utm_medium=<medium>&utm_campaign=<campaign>`.

| Parameter | Use | Allowed values |
|---|---|---|
| `utm_source` | The platform the link is posted on | `facebook`, `linkedin`, `instagram`, `email`, `press`, `whatsapp` |
| `utm_medium` | The channel type | `social`, `email`, `referral`, `paid` |
| `utm_campaign` | The campaign or push | free text, lowercase, hyphenated, e.g. `dome-launch-2026`, `press-500yr` |

Examples:
- LinkedIn post: `https://ecodomehomes.com/?utm_source=linkedin&utm_medium=social&utm_campaign=dome-launch-2026`
- Press release: `https://ecodomehomes.com/press?utm_source=press&utm_medium=referral&utm_campaign=press-500yr`
- Email signature CTA: `https://ecodomehomes.com/contact?utm_source=email&utm_medium=email&utm_campaign=quote-cta`

GA4 reads `utm_*` automatically (Traffic acquisition, Session source/medium).
Vercel Web Analytics records UTM parameters on the page-view referrer as well.

## Manual follow-up steps (cannot be done in code)

These must be done by hand in the vendor dashboards:

1. GA4: mark each key conversion as a Key Event. Admin, Events (or Key events),
   toggle "Mark as key event" for `contact_form_submit`, `email_click`,
   `phone_click`, `chatbot_open`, `cta_click`, `pricing_calculator_engagement`.
   New custom events only appear in the list after they have fired at least once
   in production, so deploy first, generate a few test events, then mark them.
2. GA4: confirm Consent Mode is active. Admin, Data collection, and check that
   "Consent settings" shows the consent signals being received. Modeled
   conversions appear once enough denied-state traffic accumulates.
3. GA4: (optional) register custom dimensions for `language`, `page_section`,
   `page_template`, `cta_target`, `cta_dest`, `kind` so they are reportable.
4. Microsoft Clarity: enable Consent Mode on the project. Settings, Setup, turn
   OFF "Set cookies by default" so the denied `consentv2` signal is honored for
   all regions (EEA, UK, CH are already auto-enforced). Without this, non-EEA
   visitors may receive Clarity cookies before consent.
5. Vercel: confirm Web Analytics and Speed Insights are enabled for the project
   (Vercel dashboard, Analytics and Speed Insights tabs, Enable). The
   `/_vercel/*` routes only resolve after they are enabled and the next deploy.
6. Vercel: custom events appear under Web Analytics, Events after the next
   production deploy generates traffic.
