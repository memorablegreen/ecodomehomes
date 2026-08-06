# EcoDomeHomes: what has NOT been verified

Written to be uncomfortable rather than reassuring. If a flow is not listed as walked in
`UI-TEST-PLAN.md`, it is not known to work, however clean the code reads.

Last updated: 2026-08-06.

---

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
that stops it rejecting ordinary surnames (`Scunthorpe`). It was left alone on 2026-08-06 because it
is not what broke, but it is weaker than the name suggests.

## Never walked at all

Everything in `UI-TEST-PLAN.md` marked NEVER. The ones that carry real money or real embarrassment:

- **Contact form** (Flow 4). An enquiry silently failing to reach the inbox or GHL is a lost lead
  and nobody would know. Never submitted through the UI.
- **Lead capture into GHL** (Flow 3). Never observed from a browser sign-in. The alert email to
  Chris has never been confirmed to arrive.
- **Saved quotes** (Flow 2). Save and reload have never been exercised by a browser.
- **Password-gated proposals** (Flow 6). Never tested that the wrong password is actually refused.
  This one is a disclosure risk, not just a broken feature.

## Test-data cleanup inventory

The 2026-08-06 verification created **no** rows: every run stopped at the provider's sign-in page,
before any account was created. Confirmed against `auth.users` (still only 3 users, newest
2026-08-03).

Nothing to clean up. Future walks that complete a sign-in must record the account and the resulting
`edh_leads` / GHL contact ids here and remove them afterwards.
