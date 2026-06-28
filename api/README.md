# EcoDomeHomes lead-capture functions

Two Vercel Node serverless functions back the website's lead forms. They replace
the old `mailto:` forms, which silently lost submissions on mobile and webmail.

- `POST /api/contact`   - "Request information" form on `contact.html` (all locales)
- `POST /api/subscribe` - newsletter signup on `updates.html` (all locales)

Each request:

1. Upserts the lead into GoHighLevel (MG/EDH CRM) and attaches a labeled note
   carrying every rich field (so nothing depends on custom-field IDs).
2. Emails `EcoDomeHomes@memorablegreen.com` a formatted copy (self-BCC).

Shared logic lives in `api/_lib/leads.js` (underscore prefix, so Vercel does not
expose it as a route). Front-end handler: `js/contact-form.js`. Conversion events
fire from `js/analytics-events.js` on the `edh:lead-success` event (success only).

## Required Vercel environment variables

Set all six in the `ecodomehomes` project (Production + Preview).

| Variable | What it is | Where to get the value |
| --- | --- | --- |
| `GHL_PIT_TOKEN` | GoHighLevel Private Integration Token (Bearer) | `~/Projects/mg-ghl/config.json` -> `ghl.api_token` (`pit-...`) |
| `GHL_LOCATION_ID` | MG/EDH GHL location id | `~/Projects/mg-ghl/config.json` -> `ghl.location_id` |
| `SMTP_HOST` | Hostinger SMTP host | `smtp.hostinger.com` |
| `SMTP_PORT` | Hostinger SMTP port (SSL) | `465` |
| `SMTP_USER` | Hostinger mailbox user | `contact@memorablegreen.com` |
| `SMTP_PASS` | Hostinger mailbox password | same value as `MAILBOX_PASSWORD` in `~/Projects/edh-mail/.env.local` |

If GHL vars are missing the function skips the CRM step; if SMTP vars are missing
it skips the email step. As long as one path succeeds the lead is captured and the
client gets `{ ok: true }`. If both fail it returns `502`. Secrets never reach the
client and are never logged.

## GoHighLevel endpoints used

- `POST https://services.leadconnectorhq.com/contacts/upsert`
- `POST https://services.leadconnectorhq.com/contacts/{contactId}/notes`

Headers on every call: `Authorization: Bearer <GHL_PIT_TOKEN>`,
`Version: 2021-07-28`, `Content-Type: application/json`, and a browser
`User-Agent` (required, Cloudflare returns 1010/403 without it).

Contact tags: `website-contact`, `ecodomehomes`. Subscribe tags: `newsletter`,
`ecodomehomes`. `source` is `EcoDomeHomes website`. `country` is free text from the
form, so it is kept in the note, not sent as the GHL country field (which expects
an ISO-2 code).

## Field -> note mapping (contact)

`name` -> firstName/lastName + full name. `email`, `phone` -> contact fields. The
note body carries: Name, Email, Phone, Country, Configuration of interest, Build
level, Approximate size, Target timeline, Owns the site, Message. Select/radio
value codes are expanded to human labels server-side (see `_lib/leads.js`).

## Local test

    node api/_lib/leads.test.js

Stubs `global.fetch` (GHL) and the SMTP transport; exercises happy path,
validation, honeypot, and partial-failure branches for both endpoints.

## curl smoke tests (against a deployed or `vercel dev` URL)

    curl -sS -X POST https://www.ecodomehomes.com/api/contact \
      -H 'Content-Type: application/json' \
      -d '{"name":"Test Lead","email":"test@example.com","phone":"+1 555 000 0000","country":"USA","configuration":"family","tier":"builder","size":"120-180","timeline":"6-12mo","site":"yes","message":"Just testing."}'

    curl -sS -X POST https://www.ecodomehomes.com/api/subscribe \
      -H 'Content-Type: application/json' \
      -d '{"email":"test@example.com"}'

Both should return `{"ok":true}`. A missing/invalid required field returns
`400 {"ok":false,"error":"..."}`; a filled `company_website` honeypot returns
`200 {"ok":true}` with no lead created.
