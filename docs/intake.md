# Buyer intake form (`/intake`)

A follow-up form for a buyer we are already talking to. They sign in, describe
the site, the building, the rooms, pick good / better / best for every one of
the estimator's 26 residential sections, answer the systems questions, give a
timeline and budget range, and send it. The record reaches the owner as an
email and a GoHighLevel note, and the team runs the estimate by hand from it.

**The form never calculates or shows a price.** The answers are tier keys,
counts, choices and free text. The two things the catalog cannot price yet
(bedrooms, the utility grid connection) are collected and flagged in the
stored record and in the email, never invented.

## Files

| File | What it is |
| --- | --- |
| `intake.html` | The page. Same sign-in modal pattern as `pricing.html` (email code, Google, LinkedIn), copied, not shared. `noindex`. |
| `js/intake.js` | The form: ten steps, autosave after every change, save-and-resume, review, submit. |
| `js/intake-catalog.json` | GENERATED. Sections, tiers, plain-English copy, representative images. No prices, by construction and by check. |
| `scripts/gen-intake-catalog.mjs` | Generates the JSON from `assistant.construction_costs` (region PT) plus the copy file. `--check` for CI. |
| `scripts/data/intake-copy.json` | Hand-written meaning of each level, per section. Edit this to change what a buyer reads. |
| `api/intake.js` | `GET` resume, `POST save`, `POST submit`. Verifies the Supabase JWT, writes with the service role, syncs GHL, emails the owner. |
| `api/_lib/intake.js` | Normalization, validation, the two gap flags, the readable summary. Pure functions. |
| `api/_lib/intake.test.js` | Offline tests for the endpoint and the summary (`node api/_lib/intake.test.js`). |
| `supabase/migrations/20260907200000_edh_intakes.sql` | The table. **Not applied to production.** |
| `supabase/config.toml`, `supabase/templates/magic-link.html` | Local stack on ports 553xx, so it does not collide with another project's stack on 543xx. |
| `scripts/dev-server.mjs` | Static site + `api/*.js` on localhost, with GoHighLevel mocked. |

## Run it on localhost

```
npm ci                                # nodemailer for the email step
supabase start                        # local Postgres + Auth + Mailpit, applies the migration
node scripts/dev-server.mjs           # http://localhost:8788/intake
```

`.env.local` (gitignored) points the API at the local stack:

```
SUPABASE_URL=http://127.0.0.1:55321
SUPABASE_ANON_KEY=<local anon key from `supabase status`>
SUPABASE_SERVICE_ROLE_KEY=<local service role key from `supabase status`>
SMTP_HOST=127.0.0.1
SMTP_PORT=55325
SMTP_USER=contact@memorablegreen.com
SMTP_PASS=local
```

Sign-in codes and the owner notification both land in Mailpit at
`http://127.0.0.1:55324`. GoHighLevel is always mocked by the dev server
(`GET /mock-ghl/_calls` shows what would have been sent), so a localhost walk
never writes a test contact into the real CRM. On localhost the page uses the
local Supabase keys automatically (see the inline script at the bottom of
`intake.html`); everywhere else it uses production, like `pricing.html`.

Regenerate the catalog after a catalog or copy change (needs the production
service role key in the environment, read-only):

```
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/gen-intake-catalog.mjs
node scripts/gen-intake-catalog.mjs --check
```

`--check` always enforces the invariants on the committed file (26 sections,
three complete tiers each, no currency symbol or code, no money-looking figure,
no cost/price/source/sku/brand/item keys, no em or en dash, no British
spelling). With the two env vars set it also regenerates and fails on drift.

## What the shipper still has to do (deliberately not done here)

This work was built strictly additively while the owner was editing the repo,
so nothing that already existed was touched. To land it:

1. `package.json` scripts:
   `"check:intake": "node scripts/gen-intake-catalog.mjs --check"`,
   `"test:intake": "node api/_lib/intake.test.js"`,
   `"dev": "node scripts/dev-server.mjs"`.
2. `.github/workflows/checks.yml`: add `npm run check:intake` and `npm run test:intake`.
3. Apply `supabase/migrations/20260907200000_edh_intakes.sql` to production
   (project `thqrhletflxbrarymxkk`). It is idempotent.
4. Vercel env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and the `SMTP_*`
   set are already there for the other functions. Add `SUPABASE_ANON_KEY`
   (optional: `api/intake.js` falls back to the service key for the auth
   check, as `api/estimate-email.js` does).
5. Supabase Auth: add `https://www.ecodomehomes.com/intake` to the redirect
   allow-list so the Google and LinkedIn buttons return to the form.
6. Append the intake flow to `UI-TEST-PLAN.md` and the items below to
   `UNVERIFIED.md` (both root files were left alone for the same reason).
7. Walk production after deploy (the standard: a local walk is preparation,
   not verification).

## UI test plan (walked on localhost 2026-09-07, desktop 1280 and phone 390)

Signed in as `uitest.buyer.desktop@example.com` / `uitest.buyer.phone@example.com`
against the local stack. Script: Playwright, headless Chromium.

| # | Step | Walked |
| --- | --- | --- |
| 1 | Open `/intake` signed out: gate card, "Get started" | yes, both widths |
| 2 | Sign in: email, 6-digit code read out of Mailpit, verify | yes, both widths (and twice on desktop) |
| 3 | Step 1 Site: Continue on an empty page refuses with inline errors | yes |
| 4 | Step 1 Site: name, phone, country, region, address, land, access, utilities, notes | yes |
| 5 | Step 2 Building: domes stepper, diameters, levels, foundation, area typed in ft2 fills m2 | yes (1600 ft2 -> 149 m2) |
| 6 | Step 3 Rooms: bedroom / bathroom / half-bath steppers, garage, office, other rooms | yes |
| 7 | Step 4 Kitchen and baths: Continue with nothing picked refuses; pick Best / Better; tier cards show image, headline, description, includes list | yes |
| 8 | Step 5 Interior: seven sections | yes |
| 9 | Step 6 Exterior: seven sections including "No shutters" | yes |
| 10 | Step 7 Water and outdoors: "Not sure yet" on rainwater | yes |
| 11 | "Save and finish later", then Sign out, then a NEW browser context (no storage), sign in again with a fresh code | yes, desktop |
| 12 | Resume: welcome-back banner, lands on step 7, step 7 choices intact, step 1 name and region intact | yes, desktop |
| 13 | Step 8 Systems: heating, cooling, hot water, fireplace, electricity (hybrid), solar, solar hot water (none), battery | yes |
| 14 | Step 9 Timeline: start, budget range, currency, notes | yes |
| 15 | Step 10 Review: every answer shown, no "Not answered", Edit links, consent notice | yes |
| 16 | Submit: thank-you screen | yes, both widths |
| 17 | Record: `assistant.edh_intakes` row `submitted`, `unpriced` carries bedrooms + grid_connection, `ghl_synced` and `notified` true | yes (local table) |
| 18 | Owner email "New EcoDomeHomes intake: <name>" to the lead inbox, reply-to the buyer, readable summary with the two NOT PRICED flags | yes (Mailpit) |
| 19 | GHL: upsert with tags `EDH Online Lead, edh-intake, ecodomehomes, edh-optin-*`, then a note carrying the summary | yes (mock) |
| 20 | No currency symbol or code, no em/en dash, no `undefined`/`NaN`, no horizontal scroll, on every screen at both widths | yes, asserted on every screenshot |
| 21 | Google / LinkedIn sign-in buttons | NOT walked (no OAuth on the local stack; hidden on localhost) |
| 22 | Consent record written to `assistant.edh_consents` | NOT walked (table does not exist locally); covered by the offline test |

## Unverified

- Production has not been walked; nothing here has been deployed.
- Google and LinkedIn sign-in on `/intake` (the OAuth redirect allow-list is a shipper step).
- `assistant.edh_consents` write on submit: unit-tested, not exercised end to end.
- The real GoHighLevel API (mocked locally; the request shape is the one `api/contact.js` already uses in production).
- The catalog images are served from the production `catalog-images` public bucket. A handful of file names carry a product hint (for example `pt-heating-infrared-redwell.jpg`); the file name is only visible in the page source, never on the screen.
- Cleanup: the two `uitest.buyer.*@example.com` users and their rows exist only in the local stack (`supabase stop` removes them). Nothing was written to production.

## Judgment calls made without asking

- **Budget range is the buyer's own figure, not ours**, so it is asked as ranges in words ("250 to 400 thousand") with a separate currency choice (US dollars / Euros / other). No symbol, no code, no figure of ours appears anywhere.
- **Consent is asked once, on the review page**, with the `contact` wording from `js/consent.js`, because the lead is created on submit, not on sign-in. The sign-in modal carries no marketing box.
- **One open draft per buyer.** Submitting closes it; a later visit starts a fresh draft and the submitted record is never overwritten.
- **Country is a short select**, US and Portugal first, with "Other". Region is free text.
- **Stairs default to "no stairs" for a single-level house, garage door to "no garage" when there is no garage**, only when the buyer has not answered them.
- **`noindex, nofollow`** on the page: it is reached by link from us, not by search, so it stays out of the sitemap and the schema generator by design.
- **Root locale only (`/intake`)**, `lang="en-US"`, American English throughout. `check-locale-parity` reports it as a presence difference, as it does for any root-only page; that check is report-only in CI.
