# EcoDomeHomes: UI test plan

What a real visitor can do on this site, as numbered steps, with an honest record of whether each
step has ever actually been walked in a browser. "Walked" means a browser drove the real interface
on the live site and the result was observed. Server checks, unit tests and reading the code do not
count and never will.

Companion file: `UNVERIFIED.md` (what is NOT covered, and why).

Last updated: 2026-08-06.

Status key: `WALKED <date>` · `PARTIAL` (see note) · `NEVER`

---

## Flow 1 — Pricing calculator sign-in gate (`/pricing` + 6 locale copies)

The prices, the size slider and the add-on costs are all behind sign-in, so this flow IS the
revenue path. Three sign-in methods, and they fail independently: one working proves nothing about
the other two. That is not a hypothetical, it is what happened on 2026-08-06 (see `UNVERIFIED.md`).

| # | Step | Status |
|---|---|---|
| 1.1 | Load `/pricing`, prices are masked, size slider locked | WALKED 2026-08-06 |
| 1.2 | Click the locked size slider, sign-in modal opens | WALKED 2026-08-06 |
| 1.3 | Click a provider with Name/Postcode empty, inline error appears, no navigation | WALKED 2026-08-06 |
| 1.4 | Fill Name + Postcode, click "Continue with Google", lands on accounts.google.com | WALKED 2026-08-06 |
| 1.5 | Fill Name + Postcode, click "Continue with LinkedIn", lands on api.linkedin.com | WALKED 2026-08-06 |
| 1.6 | Enter an obfuscated profane name, click a provider, blocked with "enter your real name" | WALKED 2026-08-06 (server response verified; browser run was rate-limited, see UNVERIFIED) |
| 1.7 | Complete a real Google sign-in, land back on `/pricing`, prices revealed | **NEVER** |
| 1.8 | Complete a real LinkedIn sign-in, land back on `/pricing`, prices revealed | **NEVER** |
| 1.9 | Email path: submit address, receive the 6-digit code, enter it, prices revealed | **NEVER** (end to end; the send side works, two real sign-ups exist) |
| 1.10 | Steps 1.4 and 1.5 on all 6 locale pricing pages (`/us /pt /de /es /fr /nl`) | WALKED 2026-08-06 |
| 1.11 | Disposable email address rejected before a code is sent | **NEVER** in a browser (unit-tested only) |

**Rule for this flow: walk 1.4, 1.5 AND 1.9 after any change to the auth modal, the Name/Postcode
gate, or `/api/validate-email`.** Changing one method silently breaks the others.

## Flow 2 — Post-sign-in quote behaviour (`/pricing`)

| # | Step | Status |
|---|---|---|
| 2.1 | Configure a quote while signed in, click save, "Saved" confirmation | **NEVER** |
| 2.2 | Reload the page, the saved quote comes back | **NEVER** |
| 2.3 | Sign out, prices re-mask | **NEVER** |

## Flow 3 — Lead capture into GHL (`edh-lead` edge function)

| # | Step | Status |
|---|---|---|
| 3.1 | New sign-in creates a GHL contact tagged "EDH Online Lead" with name + postcode | **NEVER** walked from the browser |
| 3.2 | The same sign-in inserts a row into `assistant.edh_leads` | **NEVER** walked from the browser |
| 3.3 | The alert email actually arrives at christophergarner2@gmail.com | **NEVER** |

## Flow 4 — Contact form (`/contact`)

| # | Step | Status |
|---|---|---|
| 4.1 | Submit the form, success state shown | **NEVER** |
| 4.2 | The enquiry reaches the inbox AND GHL | **NEVER** |

## Flow 5 — Newsletter subscribe

| # | Step | Status |
|---|---|---|
| 5.1 | Submit an address, success state shown | **NEVER** |
| 5.2 | The subscriber lands where it should | **NEVER** |

## Flow 7 — Marketing consent (`js/consent.js`, `/api/geo`, `edh-consent`)

Added 2026-08-11. Walked on a LOCAL server against the branch, because the branch is not deployed;
every row below must be re-walked on `https://www.ecodomehomes.com` after deploy. The region paths
were forced by intercepting `/api/geo`, which is also the only way to see both regimes on demand.

| # | Step | Status |
|---|---|---|
| 7.1 | EU visitor: unticked opt-in box in the sign-in modal, phone width | WALKED 2026-08-11 (local) |
| 7.2 | EU visitor: sign-in works WITHOUT ticking (consent never gates the gate) | WALKED 2026-08-11 (local) |
| 7.3 | US visitor: no box, opt-out notice, "ZIP code" wording | WALKED 2026-08-11 (local) |
| 7.4 | `/api/geo` down: falls back to the strict box, records nothing as granted | WALKED 2026-08-11 (local) |
| 7.5 | `js/consent.js` blocked: sign-in still works, no consent claimed | WALKED 2026-08-11 (local) |
| 7.6 | Contact form: SMS box hidden until a phone number is entered, full TCPA wording | WALKED 2026-08-11 (local) |
| 7.7 | Newsletter: notice only, legible on the dark panel | WALKED 2026-08-11 (local) |
| 7.8 | de / fr / pt: consent wording in the page language, privacy link to that locale | WALKED 2026-08-11 (local) |
| 7.9 | Google, LinkedIn and email-code sign-in all still reach their provider after the modal change | WALKED 2026-08-11 (local, root + us) |
| 7.10 | Consent row written with verbatim wording, truncated IP, server timestamp | VERIFIED 2026-08-11 (server, real JWT, real edge function) |
| 7.11 | Consent records are append-only: UPDATE refused, history preserved | VERIFIED 2026-08-11 (server) |
| 7.12 | Preferences toggle reads state and writes a withdrawal record | VERIFIED 2026-08-11 (server) |
| 7.13 | Preferences toggle **clicked in a browser** and the label flips | **NEVER** (needs a completed sign-in, so needs deploy) |
| 7.14 | GHL contact actually carries `edh-optin-*` AND the email DND state | **NEVER** (see UNVERIFIED.md) |
| 7.15 | Consent captured through a real OAuth redirect round trip survives | **NEVER** (needs deploy) |

**Rule for this flow: the consent block sits inside the sign-in modal, so 7.9 is not optional.**
Two outages on this site came from changing a shared step and testing one method.

## Flow 6 — Password-gated proposal pages (`/proposals/*`)

| # | Step | Status |
|---|---|---|
| 6.1 | Wrong password rejected | **NEVER** |
| 6.2 | Correct password reveals the proposal | **NEVER** |

---

## How to walk these

No Chrome extension is configured on this machine, so use Playwright directly:

```
npm i playwright && npx playwright install chromium
```

Drive `https://www.ecodomehomes.com`, not a local server: several of these flows depend on the
deployed serverless functions and on Supabase, and a local run does not exercise them.

Note the per-IP rate limit on `/api/validate-email` (5 POSTs per minute, and it **fails open**,
returning `ok:true`). A test run that fires more than five sign-in attempts a minute will get false
passes on anything the validator is supposed to block. Space the runs out or accept the gap and say
so.
