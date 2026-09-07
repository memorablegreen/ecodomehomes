-- assistant.edh_intakes: the buyer intake form (intake.html).
--
-- One row per intake. A signed-in buyer gets ONE open draft at a time (the
-- partial unique index below); saving from the form updates it, submitting
-- flips it to 'submitted' and stamps submitted_at. A later intake by the same
-- person starts a fresh draft, so the submitted record is never overwritten.
--
-- Modeled on assistant.edh_leads: the lead columns (user_id, email, name,
-- provider, ghl_contact_id, ghl_synced, notified, postal_code, the consent
-- trio, locale) carry the same names and meaning so the two tables read the
-- same way in the ops dashboard.
--
-- SERVER-ONLY, like edh_leads. RLS is on and there are deliberately NO
-- policies, so the anon and authenticated roles can neither read nor write it
-- through PostgREST. Every read and write goes through api/intake.js, which
-- verifies the buyer's Supabase JWT and then uses the service role. Nothing in
-- the browser can list intakes.
--
-- `answers` is the buyer's choices as the page collected them (see
-- api/_lib/intake.js for the shape). It carries TIER KEYS (good/better/best)
-- and plain answers only; it never carries a price, a product or a total. The
-- estimate is produced by hand from this record, never by the form.
--
-- `unpriced` lists the answers the catalog cannot price yet (bedroom count,
-- grid connection). They are flagged, not invented, so whoever runs the
-- estimate sees the gap instead of a silently missing line.

create schema if not exists assistant;
-- Production already grants this (the schema is exposed through PostgREST and
-- api/_lib/leads.js writes to it with the service role). Stated here so a
-- fresh local stack behaves the same way.
grant usage on schema assistant to service_role;

create table if not exists assistant.edh_intakes (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null,
  email                   text not null,
  name                    text,
  phone                   text,
  provider                text,
  status                  text not null default 'draft'
                            check (status in ('draft', 'submitted')),
  -- Zero-based index of the step the buyer is on, so the form reopens there.
  step                    integer not null default 0,
  answers                 jsonb not null default '{}'::jsonb,
  unpriced                jsonb not null default '[]'::jsonb,
  -- Hash of the generated catalog (js/intake-catalog.json) the answers were
  -- made against, so a tier picked before a catalog change is not misread.
  catalog_version         text,
  locale                  text,
  postal_code             text,
  ghl_contact_id          text,
  ghl_synced              boolean not null default false,
  notified                boolean not null default false,
  marketing_email_consent boolean not null default false,
  marketing_consent_at    timestamptz,
  consent_region          text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  submitted_at            timestamptz
);

comment on table assistant.edh_intakes is
  'EcoDomeHomes buyer intake form. Tiers and answers only, never a price. Server-only via api/intake.js.';

-- One open draft per buyer.
create unique index if not exists edh_intakes_one_draft_per_user
  on assistant.edh_intakes (user_id) where status = 'draft';

create index if not exists edh_intakes_email_idx
  on assistant.edh_intakes (email);

create index if not exists edh_intakes_submitted_idx
  on assistant.edh_intakes (status, submitted_at desc);

create or replace function assistant.edh_intakes_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

drop trigger if exists edh_intakes_touch on assistant.edh_intakes;
create trigger edh_intakes_touch
  before update on assistant.edh_intakes
  for each row execute function assistant.edh_intakes_touch();

alter table assistant.edh_intakes enable row level security;

-- No policies on purpose (see the header). Belt and braces: take the table
-- grants away from the browser-facing roles as well.
revoke all on assistant.edh_intakes from anon, authenticated;
grant select, insert, update, delete on assistant.edh_intakes to service_role;
