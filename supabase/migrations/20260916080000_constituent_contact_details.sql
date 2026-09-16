-- Editing your own contact details (#1164, epic #1160).
--
-- #1163 gave a constituent a read of their own record. This gives them a
-- write -- the first one in the epic, and the one that most directly pays for
-- itself: stale contact data is why a reminder does not arrive.
--
-- `people` is the PII table. It carries a legal name, an anonymity flag, a
-- source type, staff prose, merge history and a logo, and almost none of that
-- is the subject's to edit. So the write surface is a **short, explicit
-- allowlist**, and the allowlist is the argument list of one security definer
-- function: no person parameter, no column parameter, no field map, so there
-- is nothing for a caller to widen. That is the doctrine #1163's readers
-- follow -- the scoping is in the function, never in the caller.
--
-- Why not the other shape #1160 pointed at, an update policy plus a
-- column-level grant: `authenticated` is one database role shared by every
-- staffer and every constituent, so a column grant cannot tell them apart --
-- narrowing it to this allowlist would narrow it for People > Edit too. The
-- `people update` policy already requires people:manage (20260822100000) and
-- stays exactly as it is; a constituent holds no permissions, so their only
-- way in is the function below. The integration test proves the direct path
-- stays shut.
--
-- Deliberately *not* on the allowlist: `name` (the record name a staffer
-- keeps, as against the name you go by), `is_anonymous`, `source_type`,
-- `notes`, `logo_url`, `website`, `person_type`, `auth_user_id`,
-- `primary_contact_person_id`, `notification_email` (its own flow, #1049) and
-- the role tags. `email` is not on it either -- not because it is staff-only,
-- but because it moves through a confirmation rather than through a save. See
-- part 5.

-- ---------------------------------------------------------------------------
-- 1. An address to edit
-- ---------------------------------------------------------------------------

-- #1160 named "the address fields" as part of the allowlist. There were none.
-- The only postal address in this schema is the one a gear request carries for
-- a single shipment (`gear_requests.ship_*`, 20260913230000), which is a
-- snapshot of where one parcel went rather than where a person lives.
--
-- Flattened columns rather than jsonb, for the reason that table gives: the
-- audit redaction register and the retention purge can only name columns.
--
-- `region` rather than `state`, and a free-text `country`, because a tenant is
-- not necessarily American and this is a platform table (docs/licensing.md).
-- No validation past a length cap: an address format check is a way to refuse
-- a real address, and nothing machine-reads these.

-- people_with_roles selects p.*, expanded at creation time, so new people
-- columns go through a drop and recreate (20260903030000); the computed
-- relationship takes the view's composite type as its argument, so it goes
-- first and comes back after. Fourth time (20260905060000, 20260914010000,
-- 20260914030000).
drop function public.primary_contact(public.people_with_roles);
drop view public.people_with_roles;

alter table public.people
  add column address_line1 text
    check (address_line1 is null or char_length(address_line1) <= 200),
  add column address_line2 text
    check (address_line2 is null or char_length(address_line2) <= 200),
  add column address_city text
    check (address_city is null or char_length(address_city) <= 120),
  add column address_region text
    check (address_region is null or char_length(address_region) <= 120),
  add column address_postal_code text
    check (address_postal_code is null or char_length(address_postal_code) <= 20),
  add column address_country text
    check (address_country is null or char_length(address_country) <= 120);

comment on column public.people.address_line1 is
  'Street address, first line (#1164). Written by the person themselves through set_my_contact_details(), and by people:manage on the person form.';

comment on column public.people.address_region is
  'State, province or region (#1164). Free text, and not called `state`: a tenant is not necessarily American, and this is a platform table.';

comment on column public.people.address_country is
  'Country, free text (#1164). Not an ISO code -- nothing machine-reads it, and a code list is a way to refuse a real address.';

-- ---------------------------------------------------------------------------
-- 2. An address to prove
-- ---------------------------------------------------------------------------

-- The same three-column shape #1049 gave the notification override, with the
-- same rule: an address a person asks for waits in a column nothing reads
-- until a token sent to it comes back. `people.email` is what #1162's claim
-- weighed and what every duplicate check matches on, so it is the last column
-- in this schema that should move because somebody typed into a form.
--
-- Its own triple rather than sharing the notification one: both changes can
-- legitimately be in flight at once -- "my address changed" and "send my mail
-- somewhere else" are different requests -- and one slot would silently cancel
-- whichever was asked for first.
alter table public.people
  add column email_pending text
    check (
      email_pending is null
      or email_pending ~ '^[^[:space:]@]+@[^[:space:]@]+$'
    ),
  add column email_token text
    check (
      email_token is null
      or email_token ~ '^[0-9a-f]{64}$'
    ),
  add column email_token_expires_at timestamptz,
  -- One fact with no partial state, exactly as
  -- people_notification_email_pending_complete: a pending address with no way
  -- to confirm it would sit in the UI forever, and a live token with no
  -- address behind it would confirm nothing.
  add constraint people_email_pending_complete check (
    num_nonnulls(email_pending, email_token, email_token_expires_at) in (0, 3)
  );

comment on column public.people.email_pending is
  'An address this person has asked to be reached at but has not yet proved they hold (#1164). Nothing reads it: people.email is untouched until confirm_email_change() promotes it.';

comment on column public.people.email_token is
  'SHA-256 of the confirmation token for email_pending (#1164). The raw token exists only in the email that carried it, for the reason 20260914030000 gives.';

comment on column public.people.email_token_expires_at is
  'When the pending address''s confirmation link stops working (#1164). Asking again mints a new token and supersedes this one.';

create index people_email_token_idx on public.people (email_token)
  where email_token is not null;

-- ---------------------------------------------------------------------------
-- 3. The rules every writer gets, in the trigger
-- ---------------------------------------------------------------------------

-- 20260914010000 put canonicalization and the anonymized-row rule here so that
-- every writer obeys them at once rather than each remembering to. Three
-- additions:
--
--   * The new pending address is canonicalized, and its token cleared with it,
--     so `update people set email_pending = null` stays a legal way to cancel
--     a request without tripping people_email_pending_complete.
--
--   * An anonymized person has no pending address, for the reason they have no
--     notification address.
--
--   * An anonymized person has no postal address either -- and this is where
--     that rule belongs rather than inside run_retention_purge(). The purge
--     anonymizes a person in two places today (rules D1 and D2), and
--     delete_person_data() in a third; a rule stated on the table covers all
--     of them and the fourth nobody has written yet. Without it, a purge that
--     clears a name, an email and a phone number would leave a home address
--     sitting in the row.
create or replace function public.normalize_person_email()
returns trigger
language plpgsql
as $$
begin
  new.email := nullif(lower(trim(new.email)), '');
  new.notification_email := nullif(lower(trim(new.notification_email)), '');
  new.notification_email_pending := nullif(lower(trim(new.notification_email_pending)), '');
  new.email_pending := nullif(lower(trim(new.email_pending)), '');

  if new.is_anonymous then
    new.notification_email := null;
    new.notification_email_pending := null;
    new.email_pending := null;
    new.address_line1 := null;
    new.address_line2 := null;
    new.address_city := null;
    new.address_region := null;
    new.address_postal_code := null;
    new.address_country := null;
  end if;

  if new.notification_email_pending is null then
    new.notification_email_token := null;
    new.notification_email_token_expires_at := null;
  end if;

  if new.email_pending is null then
    new.email_token := null;
    new.email_token_expires_at := null;
  end if;

  return new;
end;
$$;

-- A postal address identifies a natural person as squarely as a phone number
-- does, and person_merges snapshots people rows, so the six columns join the
-- register on 20260907150000's own line of argument. The pending address and
-- its token join it for the reason the notification triple did.
insert into public.retention_snapshot_personal_columns (table_name, column_name) values
  ('people', 'address_line1'),
  ('people', 'address_line2'),
  ('people', 'address_city'),
  ('people', 'address_region'),
  ('people', 'address_postal_code'),
  ('people', 'address_country'),
  ('people', 'email_pending'),
  ('people', 'email_token'),
  ('people', 'email_token_expires_at');

-- retention_unregistered_personal_columns() is the guard that catches the next
-- person who adds a personal column and forgets the register. Its pattern knew
-- about addresses of one kind only -- `email` -- so a postal one would have
-- gone past it unnoticed. Widening it is the honest response to a column it
-- should have flagged, the same way #1049 registered its token columns rather
-- than renaming around the guard. Body is 20260907150000's, verbatim but for
-- the pattern.
create or replace function public.retention_unregistered_personal_columns()
returns table (table_name text, column_name text)
language sql
stable
security definer
set search_path = public
as $$
  select i.table_name::text, i.column_name::text
    from information_schema.columns i
   where i.table_schema = 'public'
     and (i.table_name in (select a.table_name from public.audited_tables a)
          or i.table_name = 'people')
     and i.column_name ~ '(email|phone|instagram|pronoun|address)'
     and not exists (
       select 1 from public.retention_snapshot_personal_columns c
        where c.table_name = i.table_name
          and c.column_name = i.column_name
     )
     and not exists (
       select 1 from public.audited_tables a
        where a.table_name = i.table_name
          and i.column_name = any(a.redacted_columns)
     )
   order by 1, 2;
$$;

-- ---------------------------------------------------------------------------
-- 4. The view, back
-- ---------------------------------------------------------------------------

-- Body is 20260916020000's, which is the current one: `is_recipient` joined
-- the flags there, and recreating from an older copy would take it away again.
create view public.people_with_roles
with (security_invoker = true) as
select
  p.*,
  f.is_donor,
  f.is_sponsor,
  f.is_volunteer,
  f.is_attendee,
  f.is_staff,
  f.is_partner,
  f.is_recipient
from public.people p
cross join lateral public.person_role_flags(p.id) f;

grant select on public.people_with_roles to authenticated;

create function public.primary_contact(public.people_with_roles)
returns setof public.people
rows 1
language sql
stable
as $$
  select * from public.people where id = $1.primary_contact_person_id;
$$;

grant execute on function public.primary_contact(public.people_with_roles) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Whose record, and whether to serve it at all
-- ---------------------------------------------------------------------------

-- The gate every function below opens with -- the constituent-area sibling of
-- my_history_person_id() (#1163), minus the per-module argument, because a
-- person's own contact details belong to no module but this one.
--
-- The module check is here rather than only on the page because a page is not
-- what stops a request (#902): these RPCs are reachable with curl by anyone
-- holding a session, and "the tenant turned the constituent area off" has to
-- mean the write is refused, not that the form is hidden.
--
-- Null is the answer to every failure -- no session, no link, area off -- and
-- each caller below raises on it rather than writing nothing and reporting
-- success.
create function public.my_contact_person_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select p.id
    from public.people p
   where p.auth_user_id = (select auth.uid())
     and p.tenant_id = (select public.public_tenant_id())
     and public.public_module_enabled('constituent_accounts')
   limit 1;
$$;

comment on function public.my_contact_person_id() is
  'The caller''s people.id on this host, or null when the constituent area is off for the tenant (#1164). The gate set_my_contact_details() and request_my_email_change() open with.';

revoke execute on function public.my_contact_person_id() from public, anon;
grant execute on function public.my_contact_person_id() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Reading your own contact details
-- ---------------------------------------------------------------------------

-- The form has to render what is stored, and `people select` requires
-- people:view -- a permission the person reading their own record has no
-- reason to hold. Same argument my_public_person_id() makes, and the same
-- answer: a definer reader that returns one row, the caller's own, with no
-- parameter to steer.
--
-- Narrower than the row: no notes, no source type, no anonymity flag, no
-- token. The token in particular is a secret whose whole point is that it does
-- not come back out of the database -- what the form needs is *that* an
-- address is pending and until when, never the proof that would confirm it.
create function public.my_contact_details()
returns table (
  person_id uuid,
  name text,
  preferred_name text,
  email text,
  email_pending text,
  email_pending_expires_at timestamptz,
  phone text,
  pronouns text,
  instagram_handle text,
  preferred_mountain text,
  riding_discipline text,
  ski_experience_level text,
  snowboard_experience_level text,
  address_line1 text,
  address_line2 text,
  address_city text,
  address_region text,
  address_postal_code text,
  address_country text
)
language sql
security definer
set search_path = public
stable
as $$
  select p.id,
         p.name,
         p.preferred_name,
         p.email,
         -- A pending address whose link has run out is no longer pending to a
         -- reader: the form should offer to ask again, not to wait.
         case when p.email_token_expires_at > now() then p.email_pending end,
         case when p.email_token_expires_at > now() then p.email_token_expires_at end,
         p.phone,
         p.pronouns,
         p.instagram_handle,
         p.preferred_mountain,
         p.riding_discipline,
         p.ski_experience_level,
         p.snowboard_experience_level,
         p.address_line1,
         p.address_line2,
         p.address_city,
         p.address_region,
         p.address_postal_code,
         p.address_country
    from public.people p
   where p.id = public.my_contact_person_id();
$$;

comment on function public.my_contact_details() is
  'The caller''s own editable contact details (#1164). Takes no arguments -- the person is auth.uid() on the request host. Returns the allowlist plus the pending-address state, never the confirmation token.';

revoke execute on function public.my_contact_details() from public, anon;
grant execute on function public.my_contact_details() to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Writing them
-- ---------------------------------------------------------------------------

-- The allowlist, as an argument list. Every argument names one column a person
-- may state about themselves; there is no argument that names a person, a
-- tenant or a column, so the set of columns this can write is fixed at
-- migration time and a caller has no say in it.
--
-- Every value is taken as given rather than merged: the form posts the whole
-- set, and a null means "I have cleared this", which a person must be able to
-- do. That makes last-write-wins the rule where a staffer has set a field --
-- the decision #1160 asked for, taken deliberately. At this size the
-- alternative (refusing a write that would overwrite a staff correction) would
-- mean a person who cannot fix their own phone number and no screen anywhere
-- explaining why; the audit row in part 8 is what makes the loop visible if it
-- ever happens, and a staffer keeps the last word because they can still edit
-- afterwards.
--
-- The rider profile is resolved as a group for the reason merge_people() and
-- the retention purge both do: people_ski_level_requires_ski and
-- people_snowboard_level_requires_snowboard (20260901050000) reject a level
-- whose discipline is not set, so a level for a discipline the person does not
-- ride is dropped here rather than raising at them.
create function public.set_my_contact_details(
  p_preferred_name text,
  p_phone text,
  p_pronouns text,
  p_instagram_handle text,
  p_preferred_mountain text,
  p_riding_discipline text,
  p_ski_experience_level text,
  p_snowboard_experience_level text,
  p_address_line1 text,
  p_address_line2 text,
  p_address_city text,
  p_address_region text,
  p_address_postal_code text,
  p_address_country text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person_id uuid;
  v_before jsonb;
  v_after jsonb;
  v_discipline text := nullif(btrim(p_riding_discipline), '');
  v_ski text := nullif(btrim(p_ski_experience_level), '');
  v_snowboard text := nullif(btrim(p_snowboard_experience_level), '');
  v_handle text := nullif(btrim(ltrim(btrim(p_instagram_handle), '@')), '');
begin
  v_person_id := public.my_contact_person_id();
  if v_person_id is null then
    raise exception 'No record to edit';
  end if;

  if v_discipline is not null and v_discipline not in ('ski', 'snowboard', 'both') then
    raise exception 'That is not a riding discipline';
  end if;
  if v_discipline is null or v_discipline not in ('ski', 'both') then
    v_ski := null;
  end if;
  if v_discipline is null or v_discipline not in ('snowboard', 'both') then
    v_snowboard := null;
  end if;
  if v_ski is not null and v_ski not in ('beginner', 'intermediate', 'advanced') then
    raise exception 'That is not an experience level';
  end if;
  if v_snowboard is not null and v_snowboard not in ('beginner', 'intermediate', 'advanced') then
    raise exception 'That is not an experience level';
  end if;
  if v_handle is not null and v_handle !~ '^[A-Za-z0-9._]{1,30}$' then
    raise exception 'An Instagram handle is letters, numbers, periods and underscores';
  end if;

  select public.person_self_edit_snapshot(p) into v_before
    from public.people p where p.id = v_person_id;

  update public.people set
    preferred_name = nullif(btrim(p_preferred_name), ''),
    phone = nullif(btrim(p_phone), ''),
    pronouns = nullif(btrim(p_pronouns), ''),
    instagram_handle = v_handle,
    preferred_mountain = nullif(btrim(p_preferred_mountain), ''),
    riding_discipline = v_discipline,
    ski_experience_level = v_ski,
    snowboard_experience_level = v_snowboard,
    address_line1 = nullif(btrim(p_address_line1), ''),
    address_line2 = nullif(btrim(p_address_line2), ''),
    address_city = nullif(btrim(p_address_city), ''),
    address_region = nullif(btrim(p_address_region), ''),
    address_postal_code = nullif(btrim(p_address_postal_code), ''),
    address_country = nullif(btrim(p_address_country), ''),
    updated_at = now(),
    updated_by = (select auth.uid())
  where id = v_person_id;

  select public.person_self_edit_snapshot(p) into v_after
    from public.people p where p.id = v_person_id;

  perform public.log_person_self_edit(v_person_id, v_before, v_after);
end;
$$;

comment on function public.set_my_contact_details(text, text, text, text, text, text, text, text, text, text, text, text, text, text) is
  'The constituent contact-details allowlist, as an argument list (#1164). Writes only the caller''s own row, only these columns, and leaves an audit row naming them as the author. Not a way to edit email: that goes through request_my_email_change().';

revoke execute on function public.set_my_contact_details(text, text, text, text, text, text, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.set_my_contact_details(text, text, text, text, text, text, text, text, text, text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Attribution
-- ---------------------------------------------------------------------------

-- #1160 asks that every self-edit leave an audit row naming the constituent,
-- so a staffer looking at a record sees the person changed it themselves
-- rather than suspecting bad data.
--
-- Written by the function rather than by a trigger, which is a deliberate
-- exception to 20260822120000's rule that coverage belongs in a trigger so no
-- write path can skip it. The rule holds because a trigger cannot be
-- forgotten; here there is exactly one write path by construction -- the
-- allowlist function above and the confirmation below -- and a trigger on
-- `people` would audit something else entirely. #18 left the PII table out of
-- the audited set on purpose (20260904180000 records why person_merges exists
-- at all), and reversing that would put every import, every registration
-- upsert and every notification token write into audit_log. That is a platform
-- decision, not this ticket's.
--
-- So `people` is registered in audited_tables without a trigger: the registry
-- is what audit_log.table_name's foreign key resolves against, and
-- registration is what lets these rows exist at all. The comment on the row
-- says so, so the next reader does not take a missing trigger for an
-- oversight.
insert into public.audited_tables (table_name, pk_column) values ('people', 'id');

comment on table public.audited_tables is
  'The tables audit_log may name, and each one''s identity column (#421). Every row but `people` also carries an audit_log_row trigger; `people` is registered so that the self-edit functions in 20260916080000 can attribute a constituent''s own change, and deliberately carries no trigger -- auditing every write to the PII table is a decision #18 declined to take.';

-- What a self-edit snapshot holds: the allowlist and the two identity fields
-- that make a row readable on its own, and nothing else. Not `to_jsonb(row)`
-- like the trigger's snapshots, on the reasoning 20260907150000 draws --
-- staff prose and a pending token are not evidence of what this person did,
-- and an audit trail should not become the second place `notes` lives.
create function public.person_self_edit_snapshot(p public.people)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'name', p.name,
    'preferred_name', p.preferred_name,
    'email', p.email,
    'phone', p.phone,
    'pronouns', p.pronouns,
    'instagram_handle', p.instagram_handle,
    'preferred_mountain', p.preferred_mountain,
    'riding_discipline', p.riding_discipline,
    'ski_experience_level', p.ski_experience_level,
    'snowboard_experience_level', p.snowboard_experience_level,
    'address_line1', p.address_line1,
    'address_line2', p.address_line2,
    'address_city', p.address_city,
    'address_region', p.address_region,
    'address_postal_code', p.address_postal_code,
    'address_country', p.address_country
  );
$$;

comment on function public.person_self_edit_snapshot(public.people) is
  'The before/after payload of a constituent self-edit audit row (#1164): the allowlist plus name and email, and nothing else. Every key is registered in retention_snapshot_personal_columns, so the audit_log_snapshots rule clears all of it on the same clock as the trigger''s snapshots.';

-- No row when nothing moved. A form that is opened, read and submitted
-- unchanged is not a change, and an audit trail that records it teaches a
-- staffer to stop reading it.
create function public.log_person_self_edit(
  p_person_id uuid,
  p_before jsonb,
  p_after jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
begin
  if p_before is not distinct from p_after then
    return;
  end if;

  select tenant_id into v_tenant_id from public.people where id = p_person_id;

  insert into public.audit_log
    (tenant_id, table_name, record_id, action, actor_id, old_data, new_data)
  values
    (v_tenant_id, 'people', p_person_id, 'update', (select auth.uid()), p_before, p_after);
end;
$$;

comment on function public.log_person_self_edit(uuid, jsonb, jsonb) is
  'Records one constituent self-edit in audit_log with the constituent as actor (#1164). Definer because audit_log has no insert policy for anyone -- it is append-only through the API, and this is the second writer after audit_log_row().';

-- Callable only from the two definer functions above, which run as the owner.
-- A session could otherwise write whatever it liked into the audit trail.
revoke execute on function public.log_person_self_edit(uuid, jsonb, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 9. Changing the address on your record
-- ---------------------------------------------------------------------------

-- `people.email` and the auth account's address are **two things**, and this
-- decision is now written down (docs/spec/people.md §5.9). They can already
-- differ: a record created by staff from a paper form and later claimed by a
-- Google account has both. What this changes is the record's address -- where
-- the organization writes to you and what a staffer reads off your row --
-- never how you sign in, which belongs to the identity provider and is changed
-- there.
--
-- Three outcomes, because the caller has to know whether to send anything:
--
--   'unchanged' the address asked for is already on the record.
--   'taken'     another record in this tenant already holds it.
--   'pending'   recorded and waiting; send the link.
--
-- 'taken' is checked here and again at confirmation, and it is the answer to
-- #1160's "must not let someone edit their way into matching another record":
-- people_email_key (20260906020000) is unique on (tenant_id,
-- lower(email)), so the collision is refused by the database whatever this
-- function does -- the check is what turns a constraint violation into a
-- sentence somebody can act on.
--
-- It does tell the caller that *some* record in this tenant holds an address,
-- which is a disclosure worth naming. It is a small one: the person is already
-- linked to a record in this tenant, the answer is the same one the claim form
-- gives, and the alternative -- accepting the request, mailing the address and
-- failing silently at confirmation -- would send mail to a stranger to hide it.
--
-- Clearing is not offered. An empty address is a record with no way to be
-- reached, and a person who wants that wants deletion, which is a retention
-- ticket (docs/tenants.md).
create function public.request_my_email_change(
  p_email text,
  p_token_hash text
)
returns table (
  outcome text,
  person_id uuid,
  tenant_id uuid,
  display_name text,
  pending_email text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person public.people;
  v_person_id uuid;
  v_email text := nullif(lower(btrim(p_email)), '');
  v_expires_at timestamptz := now() + interval '24 hours';
begin
  v_person_id := public.my_contact_person_id();
  if v_person_id is null then
    raise exception 'No record to edit';
  end if;

  if v_email is null then
    raise exception 'An email address is required';
  end if;

  -- Deliberately loose, and the same shape as the column's check constraint:
  -- this catches a stray word or a truncated paste, not an address a mail
  -- server would refuse. Only the provider can answer that.
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+$' then
    raise exception 'That does not look like an email address';
  end if;

  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'A confirmation token is required';
  end if;

  select p.* into v_person from public.people p where p.id = v_person_id;

  if v_email = lower(coalesce(v_person.email, '')) then
    -- Already the address on the record. Drop any competing request so the
    -- form stops offering to confirm something that would change nothing.
    update public.people
       set email_pending = null
     where id = v_person_id;
    return query select 'unchanged'::text, v_person.id, v_person.tenant_id,
                        coalesce(v_person.preferred_name, v_person.name),
                        null::text, null::timestamptz;
    return;
  end if;

  if exists (
    select 1 from public.people o
     where o.tenant_id = v_person.tenant_id
       and o.id <> v_person_id
       and lower(o.email) = v_email
  ) then
    return query select 'taken'::text, v_person.id, v_person.tenant_id,
                        coalesce(v_person.preferred_name, v_person.name),
                        null::text, null::timestamptz;
    return;
  end if;

  update public.people
     set email_pending = v_email,
         email_token = p_token_hash,
         email_token_expires_at = v_expires_at
   where id = v_person_id;

  return query select 'pending'::text, v_person.id, v_person.tenant_id,
                      coalesce(v_person.preferred_name, v_person.name),
                      v_email, v_expires_at;
end;
$$;

comment on function public.request_my_email_change(text, text) is
  'Asks for the caller''s own people.email to be changed (#1164). Records the address as pending and nothing more -- people.email moves only when confirm_email_change() is given the token sent to it.';

revoke execute on function public.request_my_email_change(text, text) from public, anon;
grant execute on function public.request_my_email_change(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 10. Proving it
-- ---------------------------------------------------------------------------

-- Callable by anon, for the reason confirm_notification_email() is: the link
-- is followed from the mailbox being claimed, which is frequently not the
-- browser the session lives in. Possession of the token is the proof being
-- asked for, and a sign-in requirement would reject exactly the case this
-- exists to serve.
--
-- A separate function from confirm_notification_email() rather than one that
-- confirms either kind. #1160 asked for reuse rather than a second
-- confirmation, and what is reused is the mechanism -- the pending triple, the
-- hashed one-day token, the rate limiter, the deliverEmail ledger and the
-- confirm page's own component. What is not shared is the promotion, because
-- the two promote different columns with different consequences: one redirects
-- mail, the other moves the key a claim and every duplicate check match on.
-- Folding them into one function would mean a branch on a column name inside
-- the one place that must not get that wrong.
--
-- Returns no rows for an unknown, expired or already-used token, which the
-- caller cannot and should not be able to tell apart.
create function public.confirm_email_change(
  p_token_hash text,
  p_ip_address inet
)
returns table (
  outcome text,
  person_id uuid,
  tenant_id uuid,
  confirmed_email text,
  previous_email text,
  display_name text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person public.people;
begin
  if not public.check_rate_limit('confirm_email_change', p_ip_address, 20, interval '15 minutes') then
    raise exception 'Too many attempts. Please try again later.';
  end if;

  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return;
  end if;

  -- for update: a mail client prefetching the link and the person following it
  -- would otherwise both read a live token and both promote.
  select * into v_person
    from public.people
   where email_token = p_token_hash
     and email_token_expires_at > now()
     and email_pending is not null
   for update;

  if not found then
    return;
  end if;

  -- Checked again, because the window between asking and confirming is a day
  -- and somebody else's record may have taken the address in it. The pending
  -- request is dropped rather than left to fail on every retry.
  if exists (
    select 1 from public.people o
     where o.tenant_id = v_person.tenant_id
       and o.id <> v_person.id
       and lower(o.email) = v_person.email_pending
  ) then
    update public.people set email_pending = null where id = v_person.id;
    return query select 'taken'::text, v_person.id, v_person.tenant_id,
                        null::text, null::text,
                        coalesce(v_person.preferred_name, v_person.name);
    return;
  end if;

  update public.people
     set email = v_person.email_pending,
         email_pending = null,
         updated_at = now()
   where id = v_person.id;

  perform public.log_person_self_edit(
    v_person.id,
    public.person_self_edit_snapshot(v_person),
    (select public.person_self_edit_snapshot(p) from public.people p where p.id = v_person.id)
  );

  return query
    select 'confirmed'::text,
           v_person.id,
           v_person.tenant_id,
           v_person.email_pending,
           -- Where the organization wrote until this moment, which is who has
           -- to be told.
           v_person.email,
           coalesce(v_person.preferred_name, v_person.name);
end;
$$;

comment on function public.confirm_email_change(text, inet) is
  'Promotes a pending people.email once the token sent to it comes back (#1164). Anon-callable because the link is followed from the mailbox being claimed; rate-limited per (route, ip) like every other public entry point.';

grant execute on function public.confirm_email_change(text, inet) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 11. A merge must not drop an address
-- ---------------------------------------------------------------------------

-- merge_people()'s own comment: "Adding a people column means adding it here
-- too, or a merge silently drops the duplicate's value for it." Six of them.
--
-- The pending triple is deliberately absent, and that is not the same
-- oversight. A confirmation in flight belongs to the row that was asked about;
-- carrying it onto a survivor would let a link sent about one record promote
-- an address onto another. The duplicate's row is snapshotted into
-- person_merges and then deleted, so the token dies with it and the person
-- asks again -- which is the correct outcome for a request whose subject no
-- longer exists.
--
-- Body is 20260914010000's, verbatim but for the six lines in the field merge.
create or replace function public.merge_people(
  p_survivor_id uuid,
  p_duplicate_id uuid,
  p_field_overrides jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_survivor public.people;
  v_duplicate public.people;
  v_blocker text;
  v_repointed jsonb := '{}'::jsonb;
  v_n bigint;
  v_o jsonb := coalesce(p_field_overrides, '{}'::jsonb);
  v_discipline text;
  v_ski text;
  v_snowboard text;
  v_tenant_id uuid := public.current_tenant_id();
begin
  if not public.has_permission('people', 'manage') then
    raise exception 'Not authorized';
  end if;

  if p_survivor_id = p_duplicate_id then
    raise exception 'A person cannot be merged into themselves';
  end if;

  -- Lock both rows for the duration; a concurrent merge of the same pair would
  -- otherwise repoint half the records each. Scoped to the current tenant so a
  -- foreign id is simply not found.
  select * into v_survivor from public.people
   where id = p_survivor_id and tenant_id = v_tenant_id for update;
  if not found then
    raise exception 'No such person';
  end if;

  select * into v_duplicate from public.people
   where id = p_duplicate_id and tenant_id = v_tenant_id for update;
  if not found then
    raise exception 'No such person';
  end if;

  -- The review screen already showed these, but it is advice, not enforcement.
  select detail into v_blocker
    from public.person_merge_blockers(p_survivor_id, p_duplicate_id)
   where kind = 'blocker'
   limit 1;
  if v_blocker is not null then
    raise exception '%', v_blocker;
  end if;

  -- Move a portal login only when the survivor has none. Clear the duplicate's
  -- first: people_auth_user_id_key (20260823130000) is partial-unique, so
  -- setting the survivor's while the duplicate still holds it would violate it.
  if v_duplicate.auth_user_id is not null and v_survivor.auth_user_id is null then
    update public.people set auth_user_id = null where id = p_duplicate_id;
    update public.people set auth_user_id = v_duplicate.auth_user_id where id = p_survivor_id;
  end if;

  -- Pre-delete only where a duplicate row carries no payload the merge would
  -- lose, so the generic repoint below cannot collide on it.
  -- person_organizations is a bare membership. person_role_tags was one too
  -- until #1024 gave the sponsor tag an `is_public` flag that publishes an
  -- organization to the public sponsor wall, so that one value is carried
  -- across first and the assertion itself is still dropped.
  --
  -- True wins rather than the survivor's value, matching the coalesce(...)
  -- rule the field merge below uses: a merge should never take something off
  -- the public site, and unpublishing stays a deliberate tick in the person
  -- form. The survivor is the row that lives, so the flag is moved onto it
  -- before its duplicate goes.
  update public.person_role_tags s
     set is_public = true
    from public.person_role_tags d
   where s.person_id = p_survivor_id
     and d.person_id = p_duplicate_id
     and d.role = s.role
     and d.is_public
     and not s.is_public;

  delete from public.person_role_tags t
   where t.person_id = p_duplicate_id
     and exists (
       select 1 from public.person_role_tags s
        where s.person_id = p_survivor_id and s.role = t.role
     );

  -- Four cases: the membership that would become self-referential either way
  -- (person_organizations_not_self, a check violation the repoint loop's
  -- unique_violation handler would not catch), and the two duplicate-membership
  -- directions.
  delete from public.person_organizations o
   where (o.person_id = p_duplicate_id and o.organization_id = p_survivor_id)
      or (o.organization_id = p_duplicate_id and o.person_id = p_survivor_id)
      or (o.person_id = p_duplicate_id and exists (
            select 1 from public.person_organizations s
             where s.person_id = p_survivor_id and s.organization_id = o.organization_id))
      or (o.organization_id = p_duplicate_id and exists (
            select 1 from public.person_organizations s
             where s.organization_id = p_survivor_id and s.person_id = o.person_id));

  -- If the survivor's primary contact IS the duplicate, the loop below would
  -- set the survivor as its own primary contact and trip
  -- people_primary_contact_not_self mid-update. Clear it first; the field
  -- resolution further down cannot restore it, which is correct -- the person
  -- it pointed at is the one being absorbed.
  update public.people
     set primary_contact_person_id = null
   where id = p_survivor_id
     and primary_contact_person_id = p_duplicate_id;

  -- Discover the referencing columns rather than listing them: there are 41
  -- across 32 tables today and the schema gains more most weeks, so a hardcoded
  -- list would rot into a silently-skipped table. The keys are
  -- (tenant_id, <column>) since 20260906080000, so this picks out whichever
  -- column pairs with people.id rather than assuming a one-column key. This
  -- also picks up people.primary_contact_person_id, which it must -- the final
  -- delete would fail on it otherwise.
  for r in
    select c.conrelid::regclass::text as tbl, a.attname::text as col
      from pg_constraint c
      join lateral unnest(c.conkey, c.confkey) as k(child_attnum, parent_attnum) on true
      join pg_attribute pa on pa.attrelid = c.confrelid and pa.attnum = k.parent_attnum and pa.attname = 'id'
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.child_attnum
     where c.contype = 'f'
       and c.confrelid = 'public.people'::regclass
     order by 1, 2
  loop
    begin
      execute format('update %s set %I = $1 where %I = $2', r.tbl, r.col, r.col)
        using p_survivor_id, p_duplicate_id;
      get diagnostics v_n = row_count;
    exception when unique_violation or check_violation then
      -- Raise rather than drop the offending row: on these tables a collision
      -- means two real records (a sponsorship's contribution and its synced
      -- donation, a registration's check-in and discount code), and deleting
      -- either side loses data no snapshot brings back.
      raise exception 'Cannot merge: % on %. Reconcile it on both records first.',
        sqlerrm, r.tbl;
    end;

    if v_n > 0 then
      v_repointed := v_repointed || jsonb_build_object(r.tbl || '.' || r.col, v_n);
    end if;
  end loop;

  -- Belt-and-braces after the pre-clear above; harmless when it matches
  -- nothing, and people_primary_contact_not_self (20260830100000) is not a
  -- constraint worth risking on one reading of the loop.
  update public.people
     set primary_contact_person_id = null
   where id = p_survivor_id
     and primary_contact_person_id = p_survivor_id;

  -- The rider profile is resolved as one group, not field by field:
  -- people_ski_level_requires_ski / people_snowboard_level_requires_snowboard
  -- (20260901050000) reject a level whose discipline was taken from the other
  -- record. Whichever record supplies the discipline supplies all three.
  if v_survivor.riding_discipline is not null then
    v_discipline := v_survivor.riding_discipline;
    v_ski := v_survivor.ski_experience_level;
    v_snowboard := v_survivor.snowboard_experience_level;
  else
    v_discipline := v_duplicate.riding_discipline;
    v_ski := v_duplicate.ski_experience_level;
    v_snowboard := v_duplicate.snowboard_experience_level;
  end if;

  -- Adding a people column means adding it here too, or a merge silently drops
  -- the duplicate's value for it -- the same standing maintenance cost
  -- 20260903030000 records for people_with_roles.
  update public.people set
    name = coalesce(v_o->>'name', v_survivor.name, v_duplicate.name),
    preferred_name = coalesce(v_o->>'preferred_name', v_survivor.preferred_name, v_duplicate.preferred_name),
    email = coalesce(v_o->>'email', v_survivor.email, v_duplicate.email),
    notification_email = coalesce(v_o->>'notification_email', v_survivor.notification_email, v_duplicate.notification_email),
    phone = coalesce(v_o->>'phone', v_survivor.phone, v_duplicate.phone),
    instagram_handle = coalesce(v_o->>'instagram_handle', v_survivor.instagram_handle, v_duplicate.instagram_handle),
    pronouns = coalesce(v_o->>'pronouns', v_survivor.pronouns, v_duplicate.pronouns),
    notes = coalesce(v_o->>'notes', v_survivor.notes, v_duplicate.notes),
    logo_url = coalesce(v_o->>'logo_url', v_survivor.logo_url, v_duplicate.logo_url),
    website = coalesce(v_o->>'website', v_survivor.website, v_duplicate.website),
    person_type = coalesce(v_o->>'person_type', v_survivor.person_type),
    source_type = coalesce(v_o->>'source_type', v_survivor.source_type),
    preferred_mountain = coalesce(v_o->>'preferred_mountain', v_survivor.preferred_mountain, v_duplicate.preferred_mountain),
    address_line1 = coalesce(v_o->>'address_line1', v_survivor.address_line1, v_duplicate.address_line1),
    address_line2 = coalesce(v_o->>'address_line2', v_survivor.address_line2, v_duplicate.address_line2),
    address_city = coalesce(v_o->>'address_city', v_survivor.address_city, v_duplicate.address_city),
    address_region = coalesce(v_o->>'address_region', v_survivor.address_region, v_duplicate.address_region),
    address_postal_code = coalesce(v_o->>'address_postal_code', v_survivor.address_postal_code, v_duplicate.address_postal_code),
    address_country = coalesce(v_o->>'address_country', v_survivor.address_country, v_duplicate.address_country),
    riding_discipline = v_discipline,
    ski_experience_level = v_ski,
    snowboard_experience_level = v_snowboard
  where id = p_survivor_id;

  insert into public.person_merges (
    survivor_person_id, merged_person_id, merged_snapshot, survivor_before, repointed
  ) values (
    p_survivor_id, p_duplicate_id, to_jsonb(v_duplicate), to_jsonb(v_survivor), v_repointed
  );

  delete from public.people where id = p_duplicate_id;
end;
$$;
