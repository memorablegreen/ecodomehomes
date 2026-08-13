# EcoDomeHomes: what has NOT been verified

Written to be uncomfortable rather than reassuring. If a flow is not listed as walked in
`UI-TEST-PLAN.md`, it is not known to work, however clean the code reads.

Last updated: 2026-08-13.

---

## Lead-capture quote/locale fix (2026-08-13)

**A real bug was found while writing this fix and is worth recording: `pricing.html` is duplicated
per locale, not shared.** `/pt/pricing`, `/us/pricing`, `/de/pricing`, `/es/pricing`, `/fr/pricing`,
`/nl/pricing` are each an independent copy of the file. The first attempt at this fix touched only
the root file; a locale check on `/pt/pricing` then showed `edhLeadQuote` silently failing to
persist there, because the fix had never reached that copy. Any change to the sign-in / lead-capture
JS in `pricing.html` must be applied to all 7 files (`check-locale-parity.mjs` checks structural
parity but does not run this JS, so it would not have caught this).

**`us/pricing.html` is not a byte-identical copy — it wraps a distinct calculator model** (its own
`currentQuotePayload()`/`computeTotalEUR()` with different field names, plus a `market: 'us'` field
on the lead POST that the other six do not send). The de/es/fr/nl/pt copies ARE byte-identical to
root for the JS in question (only translated `.textContent` strings differ), which made a mechanical
cross-file patch safe for those five; `us/pricing.html` needed a hand-adapted version of the same
fix.

**Method used, since a real Google/LinkedIn account is still unavailable to this agent (see "Sign-in:
verified only to the doorstep" above, which still applies -- nobody has completed a real provider
sign-in through this site).** Two techniques, both driving the real deployed code, neither
impersonating a real person:

1. **OAuth-redirect boundary, simulated:** configured a non-default house, filled name/ZIP, clicked
   the real "Continue with Google" button, and read `localStorage` back before/without the tab
   actually leaving the origin (confirms `edhLeadQuote` is written synchronously, before any
   navigation). Then reloaded the SAME URL (what `redirectTo: location.origin + location.pathname`
   sends a real return leg to), which resets the in-memory `state` to defaults exactly as a real
   return would, while `edhLeadQuote` survives in localStorage. From there a real Supabase session
   was minted for the existing `uitest.consent@memorablegreen.com` verification identity via the
   service-role admin API (`admin/generate_link` + `/auth/v1/verify`, the same mechanism GoTrue uses
   for a real magic-link/OTP sign-in) and injected with `SB.auth.setSession()`, which fires the
   page's own real `onAuthStateChange` listener -> `captureLead()` -> `sendLeadCapture()` -> a real
   POST to the real `edh-lead` function. This is the same class of technique the 2026-08-11 OAuth
   consent-boundary fix used (`SB` is `window.SB`, exposed globally by the page itself).
2. **Email-code path, driven for real:** filled the sign-in modal, submitted the email form for real
   (a genuine `signInWithOtp` call), then typed a real 6-digit code into the actual on-page digit
   boxes and clicked the actual Verify button. The code was obtained via the same admin API rather
   than a mailbox read (`generate_link` returns `email_otp`, the literal code GoTrue would have
   emailed), but the verification itself (`SB.auth.verifyOtp`) is the exact call a real visitor's
   browser makes.

**Confirmed via DB read-back on a preview deployment** (`ecodomehomes-blybln5f3-...vercel.app`, this
branch, not production): a configured house survives the reload and lands correctly on root (en),
`/us/` (us, `computeTotalEUR` path), and `/pt/` (pt) -- the `/pt/` row matched the exact real-world
failure the brief was filed over, a 250 m² compound at €366,250. Also confirmed: the explicit
fallback branch (nothing stored -> live `state` used) by clearing `edhLeadQuote` before injecting the
session; the server-side locale clamp, by posting a `<script>` payload as `locale` directly to the
function and confirming the stored value was left untouched rather than overwritten; and that
`edhLeadQuote` is removed from localStorage after each successful capture.

**Still not proven, same as the 2026-08-11 note above:** a real Google or LinkedIn account completing
the actual provider handshake. Everything on our side of that handshake -- the persist-before-navigate
write, the post-redirect read-back, the POST to `edh-lead`, and the resulting row -- is covered above.

**Not tested:** `de/es/fr/nl` were patched identically to the verified pt copy (confirmed byte-for-byte
structurally identical to root before patching, and each patched copy passed a Node syntax check
after), but none of the four had a live browser walk. Locale detection for those four rests on the
same `pageLocale()` logic verified working on en/us/pt, applied to a `lang` attribute already
confirmed correct per-file (`de`, `es`, `fr`, `nl`).

**Test-data cleanup:** reused the `uitest.consent@memorablegreen.com` identity (kept, per the
one-sign-in-per-role rule). Deleted afterward: the `edh_leads`/`edh_visits`/`edh_consents` rows
created during this run, and one GHL contact created during the run (id `Nhmg9O2cnQPQ0GwL5bM9`).
Vercel preview-deployment SSO protection was temporarily disabled to drive the preview by browser and
restored to its original setting (`all_except_custom_domains`) afterward.

## The incident this file starts from (2026-08-06)

Chris sat with a potential customer who clicked "Continue with Google" on `/pricing`. Nothing
happened. They fell back to email, which worked.

Google and LinkedIn sign-in had been dead on **all seven** pricing pages since 2026-07-30, when the
Name + Postcode step went in. Cause: both provider buttons post `{name}` with no email to
`/api/validate-email`; that endpoint ran its email check on the empty string anyway, returned
`reason:'invalid'`, and the click handler treated any `ok:false` as a hard stop, so
`signInWithOAuth()` was never called. The visitor saw "Please enter a valid email address" under the
**Postcode** field.

Confirmed by the sign-up records: last Google sign-up 2026-07-29, zero since, while two people came
in by email in the same window.

**Why it went unnoticed for a week: the Name + Postcode change was tested on the email path only.**
That is the second sign-in outage on this site with the same shape. In July the OTP email templates
sent a link instead of the code the UI asked for, and nobody could sign in at all for 18 days.

The lesson is not "test more". It is specific: **this site has three sign-in methods that fail
independently, and a change to any shared step must be walked on all three.**

## Sign-in: verified only to the doorstep

Google and LinkedIn are confirmed to hand off correctly to the provider from all seven pricing
pages. That is where the verification stops.

**Nobody has completed a real Google or LinkedIn sign-in through this site and watched the prices
appear.** The return leg is unproven from the browser: the code exchange, the session landing, the
price reveal, the GHL contact, the `assistant.edh_leads` row, and the alert email are all inferred
from code and from the one Google sign-up on record (2026-07-29, before the gate went in).

Doing it properly needs a real Google account driven through a browser. That has not been done.

## Rate limiting produces false passes

`/api/validate-email` allows 5 POSTs per IP per minute and **fails open** when the limit is hit: it
returns `{ok:true}` rather than an error. A test run that exceeds that will see junk names and
disposable domains sail through and read it as a pass.

This already caught out the 2026-08-06 verification run: the profanity check appeared broken in the
browser walk purely because the same IP had just fired fourteen sign-in attempts. Re-tested after
the window cleared, it blocks correctly.

Any future automated walk of this flow must either space requests out or state this gap explicitly.

## Known-weak, deliberately not changed

The profanity filter matches on whole-word boundaries, so it catches `shit` and the leetspeak
variants it was built for, but not inflections such as `fucking`. That is the documented trade-off
that stops it rejecting ordinary surnames (`Scunthorpe`, `Cockburn`), and it survives the
2026-08-11 rebuild unchanged.

The word list itself was rebuilt on 2026-08-11 from LDNOOBW across six languages (35 words to 677),
because it had been English only while the site takes sign-ups in six languages. Real given names
and surnames were subtracted against a names corpus first: the source list contains `peter`,
`anita`, `pinto`, `quim`, `del` and `pau`, and shipping it raw would have rejected real Portuguese,
Spanish and Dutch customers at the revenue gate with no error anyone would ever see.

**Still weak in one place:** the client-side pre-check inside each pricing page is a small English
regex used only for instant feedback on blur. It was NOT expanded, so a French or Dutch obscenity
gets no immediate hint and is caught on submit instead. The server is the gate; the client check
never was.

## Never walked at all

Everything in `UI-TEST-PLAN.md` marked NEVER. The ones that carry real money or real embarrassment:

- **Contact form** (Flow 4). An enquiry silently failing to reach the inbox or GHL is a lost lead
  and nobody would know. Never submitted through the UI.
- **The estimate email in the other six locales** (Flow 8.7). Only the English page was walked. The
  localised subject and body strings have never been rendered.
- **Lead capture into GHL** (Flow 3). Never observed from a browser sign-in. The alert email to
  Chris has never been confirmed to arrive.
- **Saved quotes** (Flow 2). Save and reload have never been exercised by a browser.
- **Password-gated proposals** (Flow 6). Never tested that the wrong password is actually refused.
  This one is a disclosure risk, not just a broken feature.

## Marketing consent work (2026-08-11)

Deployed and verified against production, including a real end-to-end sign-in whose code was read
out of the live `@memorablegreen.com` mailbox, and the resulting GHL contact read back. What
remains unproven is listed at the end of this section.

**Two defects were found by walking it, both fixed and re-walked:**

1. **The preferences toggle showed the opposite of what the visitor chose.** It reads the lead row,
   but `captureLead()`'s POST is what writes that row, and nothing sequenced the two, so someone who
   had just ticked the consent box was told "Email me updates" as though they were not subscribed.
   The stored record was correct throughout. Fixed by chaining `loadPrefs()` to that request.
2. **The toggle wiped the contact's other GHL tags,** including the `EDH Online Lead` marker the
   pipeline is filtered on. GHL's contact upsert REPLACES the tag array rather than merging it, and
   the function was sending only the opt-in tag. Fixed by reading the current tags and merging;
   re-tested with a decoy manual tag, which survived.

Still not proven:

- **The OAuth return leg had a real bug, found and fixed 2026-08-11 without a provider account.**
  `captureLead()` can run before `js/consent.js` renders. `read()` reported the stored decision with
  method `unavailable`, and the edge function treats that as no-consent, so **a visitor who ticked
  the box and signed in with Google or LinkedIn was recorded as having refused**, with the wrong
  wording stored as well. The failure is invisible: the row reads `granted=false`, identical to
  someone who chose not to tick. Reproduced by removing the rendered box and reading back a stored
  decision, which FAILS on the pre-fix build and PASSES on the fix.
- **A real Google or LinkedIn round trip is still unwalked.** The known failure mode above is gone,
  but that is not the same as proving the whole redirect works with a real provider account. The
  region verdict cached in `sessionStorage` is untested across a real redirect for the same reason.
- **The GHL token used for verification came from `~/Projects/mg-ghl/config.json`.** The read-back
  is real, but note that it was done with a token this machine happens to hold, not through the
  edge function's own credential.

Two smaller notes, honestly:

- **The region stored in each record is client-reported.** Supabase edge functions do not receive a
  `cf-ipcountry` header (verified: the function returned `country: null` on every call), so the
  server cannot independently classify the visitor. The truncated IP and the timestamp ARE stamped
  server-side, and the verbatim wording shown is stored, so a record can still be corroborated. But
  `region` is metadata from the browser, not an independent server finding.
- Everything in Flow 7 marked "local" was walked against a local static server, where `/api/geo`
  does not exist and was intercepted to force each region. The endpoint itself HAS since been
  confirmed for real, returning `{"country":"PT","region":"opt_in"}` on both the preview and the
  production deployment. What no walk has covered is a real visitor from an `opt_out` country, since
  every request from this machine geolocates to Portugal.

## Test-data cleanup inventory

The 2026-08-06 verification created **no** rows: every run stopped at the provider's sign-in page,
before any account was created. Confirmed against `auth.users` (still only 3 users, newest
2026-08-03).

Nothing to clean up. Future walks that complete a sign-in must record the account and the resulting
`edh_leads` / GHL contact ids here and remove them afterwards.

**2026-08-11 consent verification.** Created and cleaned:

| Artefact | Id / address | State |
|---|---|---|
| Supabase auth user | `53e04aef-a1c6-4f96-9b01-764d46288645`, `uitest.consent@memorablegreen.com` | **KEPT** as the EDH verification identity, per the one-sign-in-per-role rule. Never delete it to "clean up". |
| `assistant.edh_consents` rows | 3 rows for that user | Deleted, table verified back to 0 rows |
| `assistant.edh_leads` / `edh_visits` rows | 1 each | Deleted |
| GHL contact | `uitest.consent@memorablegreen.com`, name "UITEST Consent" | Deleted (id `hvmYlzstZ4F6AShzj9CF`, HTTP 200) using the token in `~/Projects/mg-ghl/config.json`. |
