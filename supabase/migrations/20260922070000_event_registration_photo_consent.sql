-- #599: photo and media consent, asked at registration and recorded as a fact
-- staff can act on.
--
-- `src/lib/legal-defaults.ts` -- the terms of use served to every tenant that
-- has adopted them -- has said since it was written that where an organization
-- photographs participants for its own communications it relies on "the
-- consent process described at registration or at the event itself, not on
-- this page". There was no consent process at registration. The promise
-- survived on its second half alone: an organizer remembering to ask, with no
-- record of the answer. This makes the first half true.
--
-- THE MECHANISM IS THE PLATFORM'S AND THE SCOPE IS THE ORGANIZATION'S, and the
-- platform writes none of the scope. What an organization does with a photo --
-- its own site and social accounts, press, sponsors, funder reports -- is
-- off-platform and unknowable from this codebase, and a scope invented here
-- would be a commitment made on a tenant's behalf, of the most consequential
-- kind, because a registrant would then be consenting to it
-- (`docs/legal-basis.md` rule 2). So it lives in the `events.photo_consent`
-- content slot, blank until somebody writes it, and a tenant that has written
-- nothing ASKS NOTHING: the registration form is byte-identical to the one
-- that shipped before this, and all three columns below stay null. Almost
-- every tenant is in that state and it is the one that must never break.
--
-- THREE STATES, AND THIS IS WHERE IT STOPS LOOKING LIKE THE WAIVER. A waiver
-- (#686) has two, because declining is not submitting: you accept, or you do
-- not register, and no row exists to hold a refusal. Photo consent has three,
-- and the third is the valuable one.
--
--   null  -- NOT ASKED. This tenant had written no scope when this person
--            registered, or the answer came from a caller of the public API
--            that did not ask. Every row predating this ticket, every walk-in
--            and every staff-added registrant is here.
--   false -- asked and DECLINED. A record with an operational job: it is the
--            list somebody checks before pointing a camera.
--   true  -- asked and granted.
--
-- Nothing may read null as either answer, and nothing may read a missing row
-- as consent.
--
-- NO `WAIVER_REQUIRED` EQUIVALENT. Declining is a valid submission and must
-- never block one, so `resolved_photo_consent()` below raises nothing on the
-- way in. The only refusal case is structural and it is handled by recording
-- null: where the slot was emptied between render and submit, the answer is
-- stored as "not asked" rather than against a snapshot of text nobody saw.
--
-- A SNAPSHOT, NOT A VERSION POINTER. 20260922000000's header states the rule:
-- "the version-table shape earns its cost only when the text has to be citable
-- from outside the row that accepted it." `/waiver?version=N` is a permalink,
-- so the waiver passes it. A content slot has no version table, no address and
-- no permalink, so the words somebody answered are citable only from the row
-- holding them. They are copied, exactly as
-- `artwork_submissions.consented_terms` is (20260921000000, #1319) -- and, per
-- that column's comment, read from the tenant's own row in here and never from
-- the client.
--
-- No `legal_publication.*` row and no `legal_surface.*` key. 20260922000000
-- says why for the second: a surface key meaning "this tenant asks about
-- photos" feeds the drift fingerprint, and every tenant with its own published
-- documents would be told it had drifted the day it wrote a word here.
--
-- And no `audited_tables` row, because `event_registrations` still has none:
-- the audit trigger never sees this table, so there is no `redacted_columns`
-- question to answer.

-- ---------------------------------------------------------------------------
-- The columns
-- ---------------------------------------------------------------------------

alter table public.event_registrations
  add column photo_consent boolean,
  add column photo_consent_at timestamptz,
  add column photo_consent_text text,
  -- Written together or not at all: an answer with no timestamp is not an
  -- answer anybody can date, and a timestamp with no answer records nothing.
  -- Biconditional is safe here only because the retention purge clears all
  -- three in one statement (20260922080000) -- see the next constraint.
  add constraint event_registrations_photo_consent_pair
    check ((photo_consent is null) = (photo_consent_at is null)),
  -- One-directional, and #685's lesson is the reason. A biconditional pairing
  -- the text with the answer would be tripped by any future rule that cleared
  -- one without the other, and a 23514 raised inside `run_retention_purge()`
  -- lands in a block whose own `exception when others` swallows it -- so event
  -- registrations would silently stop anonymizing. Permitting a null snapshot
  -- beside a real answer costs nothing: the RPCs only ever write them together.
  add constraint event_registrations_photo_consent_text_scope
    check (photo_consent is not null or photo_consent_text is null);

comment on column public.event_registrations.photo_consent is
  'Whether this registrant agreed to be photographed or recorded (#599). Null means NOTHING WAS ASKED -- this tenant had written no events.photo_consent scope when the row was created, or the caller of the public API did not ask -- and must never be read as a refusal. False means asked and DECLINED, which is the answer with an operational job: it is what an organizer checks before pointing a camera. Cleared by the retention purge with the name and the email, unlike the waiver pair: see 20260922080000.';

comment on column public.event_registrations.photo_consent_at is
  'When the answer above was given, or last changed (#599). Moves when a registrant changes their mind through set_my_photo_consent(), because a consent that cannot be withdrawn is not consent -- the substantive difference from waiver_accepted_at, which records an acceptance that happened once and stands. Resolved server-side, never from the client.';

comment on column public.event_registrations.photo_consent_text is
  'The tenant''s events.photo_consent paragraphs as they stood when this answer was given (#599), joined with blank lines. Written by resolved_photo_consent() from site_content, never from the client -- the same invariant artwork_submissions.consented_terms carries (#1319). A snapshot rather than a version pointer because a content slot has no version table and no permalink, so these words are citable only from the row holding them.';

-- ---------------------------------------------------------------------------
-- Column-level SELECT
-- ---------------------------------------------------------------------------
--
-- 20260922040000 replaced this table's table-level SELECT with a column list
-- so the four minor contacts could be carved out of it. A column added later
-- without being added to the list simply disappears from the portal, which is
-- the safe direction to fail but a confusing one to debug, and
-- `event-registration-minor-contacts.integration.test.ts` is what catches it.
--
-- All three go in at `events: view`, not behind the definer view the minor
-- contacts use. The door shift is exactly who needs this, and needs it before
-- the camera comes out rather than after: a consent record nobody can see when
-- it matters is the same failure as no record. It is also far less sensitive
-- than a guardian's mobile number -- it is one bit about the person standing in
-- front of you, who told you it themselves.
revoke select on public.event_registrations from anon, authenticated;

grant select (
  id,
  tenant_id,
  event_id,
  person_id,
  name,
  email,
  phone,
  instagram_handle,
  pronouns,
  party_size,
  notes,
  attended_before,
  party_includes_minor,
  checked_in_at,
  riding_discipline_at_event,
  ski_experience_level_at_event,
  snowboard_experience_level_at_event,
  waiver_accepted_at,
  waiver_version,
  photo_consent,
  photo_consent_at,
  photo_consent_text,
  created_at
) on public.event_registrations to authenticated;

-- ---------------------------------------------------------------------------
-- The shared resolver
-- ---------------------------------------------------------------------------
--
-- One function, so the anonymous and signed-in paths cannot disagree -- the
-- reason `accepted_waiver_version()` and `resolve_minor_contacts()` exist, and
-- a stronger one here: a disagreement would be silent in the direction that
-- matters, with one path recording consent the other would have declined.
--
-- `security definer` unlike `resolve_minor_contacts()`, because this one reads
-- a table: `site_content`, whose select policy requires site_content:view on
-- the tenant, which an anonymous registrant will never hold.

create type public.photo_consent_record as (
  consent boolean,
  consented_at timestamptz,
  consent_text text
);

comment on type public.photo_consent_record is
  'What one registration records about photo and media consent (#599): the answer, when it was given, and the organization''s own scope as it stood at that moment. All three null means the question was not asked.';

create function public.resolved_photo_consent(
  p_tenant_id uuid,
  p_answer boolean
) returns public.photo_consent_record
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.photo_consent_record;
  v_text text;
begin
  -- Nothing was asked. Either the tenant has written no scope, so the
  -- component rendered nothing and the form submitted no field, or a caller of
  -- the public API omitted it -- whose published contract predates this
  -- question and cannot be made to answer it retroactively. Recorded as null,
  -- never as a decline: inventing a refusal is as wrong as inventing consent,
  -- and this branch is where almost every registration on almost every tenant
  -- goes.
  if p_answer is null then
    return v;
  end if;

  select string_agg(paragraph, E'\n\n' order by ordinality)
    into v_text
    from public.site_content sc
    cross join lateral jsonb_array_elements_text(sc.value)
      with ordinality as p(paragraph, ordinality)
   where sc.tenant_id = p_tenant_id
     and sc.key = 'events.photo_consent'
     and jsonb_typeof(sc.value) = 'array'
     and btrim(p.paragraph) <> '';

  -- The one structural case, and the reason this function reads the slot
  -- rather than trusting the answer: the scope was emptied between the moment
  -- the form was rendered and the moment it was submitted. There is now no
  -- text to snapshot, so there is nothing this answer was given against.
  -- Recording it anyway would attach a person's consent to whatever the
  -- organization happens to say next, or to nothing at all. Record that
  -- nobody was asked instead, and take the registration: a refusal here would
  -- punish a registrant for an edit somebody else made.
  if v_text is null then
    return v;
  end if;

  v.consent := p_answer;
  v.consented_at := now();
  v.consent_text := v_text;
  return v;
end;
$$;

comment on function public.resolved_photo_consent(uuid, boolean) is
  'Resolves what a registration should record about photo and media consent (#599), reading the tenant''s own events.photo_consent scope so the text is never taken from the client. Returns three nulls when nothing was asked -- an omitted answer, or a tenant that has written no scope -- and the answer with a timestamp and a snapshot otherwise. Raises nothing: declining is a valid submission and must never block one. Shared by register_for_event(), register_myself_for_event() and set_my_photo_consent() so no two paths can disagree.';

revoke execute on function public.resolved_photo_consent(uuid, boolean) from public, anon, authenticated;

-- Whether this organization is asking right now, for the portal.
--
-- This is what turns an empty cell from ambiguous into "nobody asked this
-- person" -- the same thing `legal_publication.waiver` buys the agreement row
-- beside it (#686), and the same distinction `submission-review-sheet.tsx`
-- draws for artwork consent. Without it, a registration taken before the scope
-- was written and one taken after look identical on screen.
--
-- A function rather than a read of `site_content`, because `site_content`'s
-- select policy requires site_content:view and the reader here is an
-- `events: view` door shift. It answers one bit and never the text: what the
-- registrant was asked lives on their own row, which that shift can already
-- read.
--
-- `current_tenant_id()` rather than `public_tenant_id()`: the portal is served
-- from `portal.<domain>`, and resolving the request host would answer for
-- whichever organization owns the public site at that name -- the distinction
-- `getTenantLegalPublication` makes for the same reason.
create function public.tenant_asks_photo_consent()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
      from public.site_content sc
      cross join lateral jsonb_array_elements_text(sc.value) as p(paragraph)
     where sc.tenant_id = (select public.current_tenant_id())
       and sc.key = 'events.photo_consent'
       and jsonb_typeof(sc.value) = 'array'
       and btrim(p.paragraph) <> ''
  );
$$;

comment on function public.tenant_asks_photo_consent() is
  'Whether the caller''s own tenant currently asks about photo and media consent at registration (#599) -- that is, whether events.photo_consent holds a non-blank paragraph. One bit and never the text, so an events:view reader can tell "nobody asked this person" from "they declined" without holding site_content:view.';

revoke execute on function public.tenant_asks_photo_consent() from public, anon;
grant execute on function public.tenant_asks_photo_consent() to authenticated;

-- ---------------------------------------------------------------------------
-- Anonymous registration
-- ---------------------------------------------------------------------------
--
-- One trailing parameter changes the signature, so this drops before
-- recreating (see 20260826190000's note). The body is otherwise unchanged from
-- 20260922040000.
drop function public.register_for_event(uuid, text, text, text, integer, text, text, inet, text, text, boolean, boolean, integer, boolean, text, text, text, text);

create function public.register_for_event(
  p_event_id uuid,
  p_name text,
  p_email text,
  p_phone text,
  p_party_size integer,
  p_notes text,
  p_honeypot text default null,
  p_ip_address inet default null,
  p_instagram_handle text default null,
  p_pronouns text default null,
  p_attended_before boolean default null,
  p_waiver_accepted boolean default false,
  p_waiver_version integer default null,
  p_party_includes_minor boolean default null,
  p_accompanying_adult_name text default null,
  p_accompanying_adult_phone text default null,
  p_emergency_contact_name text default null,
  p_emergency_contact_phone text default null,
  p_photo_consent boolean default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event record;
  v_existing_party_size integer;
  v_registration_id uuid;
  v_person_id uuid;
  v_pronouns text := nullif(btrim(p_pronouns), '');
  v_tenant_id uuid := public.public_tenant_id();
  v_waiver_version integer;
  v_minor public.minor_accompaniment_contacts;
  v_photo public.photo_consent_record;
begin
  if not public.check_rate_limit('register_for_event', p_ip_address, 8, interval '15 minutes') then
    raise exception 'RATE_LIMITED';
  end if;

  if p_honeypot is not null and p_honeypot <> '' then
    return gen_random_uuid();
  end if;

  if v_tenant_id is null then
    raise exception 'EVENT_NOT_FOUND';
  end if;

  -- #902
  if not public.module_enabled_for_tenant(v_tenant_id, 'events') then
    raise exception 'EVENT_NOT_FOUND';
  end if;

  select capacity, registration_enabled, registration_deadline, auto_assign_discount_codes
  into v_event
  from public.events
  where id = p_event_id
    and tenant_id = v_tenant_id
    and visibility = 'public'
    and status = 'published';

  if not found then
    raise exception 'EVENT_NOT_FOUND';
  end if;

  if not v_event.registration_enabled then
    raise exception 'REGISTRATION_CLOSED';
  end if;

  if v_event.registration_deadline is not null and v_event.registration_deadline < now() then
    raise exception 'REGISTRATION_DEADLINE_PASSED';
  end if;

  -- #1206: the same floor submit_volunteer_application() has always had. The
  -- check constraint below refuses the row either way; this is so a public
  -- caller gets a message it can act on rather than a 23514.
  if p_name is null or btrim(p_name) = '' then
    raise exception 'NAME_REQUIRED';
  end if;

  if p_party_size is null or p_party_size < 1 then
    raise exception 'INVALID_PARTY_SIZE';
  end if;

  if char_length(v_pronouns) > 40 then
    raise exception 'PRONOUNS_TOO_LONG';
  end if;

  -- After the honeypot's early return, like the waiver below: a bot that
  -- trips the honeypot and sends an incomplete answer must get the same
  -- nothing a clean bot gets, or the honeypot becomes an oracle of its own.
  -- An UNANSWERED question is never refused here -- see the header.
  v_minor := public.resolve_minor_contacts(
    p_party_includes_minor,
    p_accompanying_adult_name,
    p_accompanying_adult_phone,
    p_emergency_contact_name,
    p_emergency_contact_phone
  );

  -- After the honeypot's early return, so a bot learns nothing about whether
  -- this organization takes a waiver, and before the capacity lock, so a
  -- refusal does not queue behind other registrations for a row it will never
  -- write.
  v_waiver_version := public.accepted_waiver_version(
    v_tenant_id, p_waiver_accepted, p_waiver_version
  );

  -- Beside the waiver, and it can refuse nothing: a decline is a valid
  -- registration. The snapshot is read from this tenant's own slot in here,
  -- so the words a registrant answered against cannot be supplied by whoever
  -- is posting the form (#599).
  v_photo := public.resolved_photo_consent(v_tenant_id, p_photo_consent);

  if v_event.capacity is not null then
    -- Take the event row before counting seats, so concurrent registrations
    -- queue behind each other and every one of them sums a table that already
    -- contains the ones ahead of it. Held until this transaction commits,
    -- which is what makes the check below binding rather than advisory. Only
    -- capped events pay for it; an uncapped event never reaches this branch.
    perform 1 from public.events
     where id = p_event_id and tenant_id = v_tenant_id
     for update;

    select coalesce(sum(party_size), 0) into v_existing_party_size
    from public.event_registrations
    where event_id = p_event_id;

    if v_existing_party_size + p_party_size > v_event.capacity then
      raise exception 'EVENT_AT_CAPACITY';
    end if;
  end if;

  v_person_id := public.resolve_or_create_person_by_email(
    p_name, p_email, p_phone, null, 'other', null, p_instagram_handle, v_pronouns, v_tenant_id
  );

  -- p_attended_before is stored as given, null included: an unanswered
  -- question is unanswered, and coalescing it to false here would invent a
  -- "no" for everybody who skipped it. It is deliberately not written back to
  -- `people` -- it describes this registration's moment, and the person's own
  -- history is the check-in ledger. p_party_includes_minor is stored the same
  -- way and for the same reason, and the accompanying adult is likewise never
  -- written back: they are an arrangement for one event, not a directory
  -- record somebody asked us to keep. Photo consent is not written back
  -- either, and that one is a decision rather than an omission: an answer
  -- about one event's photographs is not a standing permission, and a
  -- `people` column saying "happy to be photographed" would be read as one.
  insert into public.event_registrations
    (tenant_id, event_id, name, email, phone, party_size, notes, person_id, instagram_handle, pronouns, attended_before,
     waiver_accepted_at, waiver_version,
     party_includes_minor, accompanying_adult_name, accompanying_adult_phone, emergency_contact_name, emergency_contact_phone,
     photo_consent, photo_consent_at, photo_consent_text)
  values
    (v_tenant_id, p_event_id, p_name, p_email, p_phone, p_party_size, p_notes, v_person_id, p_instagram_handle, v_pronouns, p_attended_before,
     case when v_waiver_version is null then null else now() end, v_waiver_version,
     p_party_includes_minor, v_minor.accompanying_adult_name, v_minor.accompanying_adult_phone,
     v_minor.emergency_contact_name, v_minor.emergency_contact_phone,
     v_photo.consent, v_photo.consented_at, v_photo.consent_text)
  returning id into v_registration_id;

  if v_event.auto_assign_discount_codes then
    update public.discount_codes
    set registration_id = v_registration_id,
        assigned_at = now()
    where id = (
      select id
      from public.discount_codes
      where event_id = p_event_id
        and registration_id is null
      order by created_at asc
      for update skip locked
      limit 1
    );
  end if;

  return v_registration_id;
exception
  when unique_violation then
    raise exception 'ALREADY_REGISTERED';
end;
$$;

comment on function public.register_for_event(uuid, text, text, text, integer, text, text, inet, text, text, boolean, boolean, integer, boolean, text, text, text, text, boolean) is
  'Anonymous public registration for a published public event. Asks every registrant whether they have been before (#1259) and whether their party includes anyone under 18 (#685), and stores both answers verbatim, null included; nothing it does varies with whether the email matched a directory record. A "yes" to the minors question must arrive with an accompanying adult and an emergency contact or it raises MINOR_CONTACTS_REQUIRED; an unanswered question is accepted, because the public API''s published contract predates it. Where the tenant has a participant waiver in force (#686), acceptance is required and the version accepted is recorded on the registration. Where the tenant has written a photo and media consent scope (#599), the answer is recorded with a snapshot of that scope -- a decline included, and a decline never refuses the registration.';

grant execute on function public.register_for_event(uuid, text, text, text, integer, text, text, inet, text, text, boolean, boolean, integer, boolean, text, text, text, text, boolean) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Registering as yourself
-- ---------------------------------------------------------------------------
--
-- Body otherwise unchanged from 20260922040000.
drop function public.register_myself_for_event(uuid, integer, text, text, text, text, inet, boolean, boolean, integer, boolean, text, text, text, text);

create function public.register_myself_for_event(
  p_event_id uuid,
  p_party_size integer,
  p_notes text default null,
  p_phone text default null,
  p_pronouns text default null,
  p_instagram_handle text default null,
  p_ip_address inet default null,
  p_attended_before boolean default null,
  p_waiver_accepted boolean default false,
  p_waiver_version integer default null,
  p_party_includes_minor boolean default null,
  p_accompanying_adult_name text default null,
  p_accompanying_adult_phone text default null,
  p_emergency_contact_name text default null,
  p_emergency_contact_phone text default null,
  p_photo_consent boolean default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := public.public_tenant_id();
  v_person_id uuid;
  v_person record;
  v_event record;
  v_existing_party_size integer;
  v_registration_id uuid;
  v_pronouns text := nullif(btrim(coalesce(p_pronouns, '')), '');
  v_handle text := public.normalize_instagram_handle(p_instagram_handle);
  v_waiver_version integer;
  v_minor public.minor_accompaniment_contacts;
  v_photo public.photo_consent_record;
begin
  -- Same route budget as the anonymous form. A signed-in caller is not more
  -- trustworthy for this purpose: an account costs an email address, and the
  -- write it reaches is the same table.
  if not public.check_rate_limit('register_myself_for_event', p_ip_address, 8, interval '15 minutes') then
    raise exception 'RATE_LIMITED';
  end if;

  v_person_id := public.my_constituent_person_id('events');
  if v_person_id is null then
    raise exception 'NO_RECORD';
  end if;

  select capacity, registration_enabled, registration_deadline, auto_assign_discount_codes
  into v_event
  from public.events
  where id = p_event_id
    and tenant_id = v_tenant_id
    and visibility = 'public'
    and status = 'published';

  if not found then
    raise exception 'EVENT_NOT_FOUND';
  end if;

  if not v_event.registration_enabled then
    raise exception 'REGISTRATION_CLOSED';
  end if;

  if v_event.registration_deadline is not null and v_event.registration_deadline < now() then
    raise exception 'REGISTRATION_DEADLINE_PASSED';
  end if;

  if p_party_size is null or p_party_size < 1 then
    raise exception 'INVALID_PARTY_SIZE';
  end if;

  if char_length(v_pronouns) > 40 then
    raise exception 'PRONOUNS_TOO_LONG';
  end if;

  -- Asked of a signed-in caller exactly as it is of an anonymous one. Holding
  -- an account says nothing about who is coming with you.
  v_minor := public.resolve_minor_contacts(
    p_party_includes_minor,
    p_accompanying_adult_name,
    p_accompanying_adult_phone,
    p_emergency_contact_name,
    p_emergency_contact_phone
  );

  -- Asked of a signed-in caller exactly as it is of an anonymous one. Holding
  -- an account is not agreement to anything: the waiver is about taking part,
  -- and a path around it would be the shortest way to a registration with no
  -- acceptance behind it.
  v_waiver_version := public.accepted_waiver_version(
    v_tenant_id, p_waiver_accepted, p_waiver_version
  );

  -- And the same question again, through the same resolver, for the reason it
  -- is shared: two paths that could disagree about consent would disagree
  -- silently, one recording permission the other would have declined (#599).
  v_photo := public.resolved_photo_consent(v_tenant_id, p_photo_consent);

  if v_event.capacity is not null then
    -- The same lock register_for_event() takes (20260907130000): hold the
    -- event row before summing seats, so concurrent registrations queue and
    -- each one counts a table that already holds the ones ahead of it. The two
    -- functions taking the same lock on the same row is what makes the check
    -- binding across *both* paths rather than only within each.
    perform 1 from public.events
     where id = p_event_id and tenant_id = v_tenant_id
     for update;

    select coalesce(sum(party_size), 0) into v_existing_party_size
    from public.event_registrations
    where event_id = p_event_id;

    if v_existing_party_size + p_party_size > v_event.capacity then
      raise exception 'EVENT_AT_CAPACITY';
    end if;
  end if;

  select coalesce(nullif(btrim(p.preferred_name), ''), p.name) as display_name,
         coalesce(nullif(btrim(p.email), ''), '') as email
    into v_person
    from public.people p
   where p.id = v_person_id;

  insert into public.event_registrations
    (tenant_id, event_id, name, email, phone, party_size, notes, person_id,
     instagram_handle, pronouns, attended_before, waiver_accepted_at, waiver_version,
     party_includes_minor, accompanying_adult_name, accompanying_adult_phone,
     emergency_contact_name, emergency_contact_phone,
     photo_consent, photo_consent_at, photo_consent_text)
  values
    (v_tenant_id, p_event_id, v_person.display_name, v_person.email,
     nullif(btrim(coalesce(p_phone, '')), ''), p_party_size,
     nullif(btrim(coalesce(p_notes, '')), ''), v_person_id, v_handle, v_pronouns,
     p_attended_before, case when v_waiver_version is null then null else now() end,
     v_waiver_version,
     p_party_includes_minor, v_minor.accompanying_adult_name, v_minor.accompanying_adult_phone,
     v_minor.emergency_contact_name, v_minor.emergency_contact_phone,
     v_photo.consent, v_photo.consented_at, v_photo.consent_text)
  returning id into v_registration_id;

  if v_event.auto_assign_discount_codes then
    update public.discount_codes
    set registration_id = v_registration_id,
        assigned_at = now()
    where id = (
      select id
      from public.discount_codes
      where event_id = p_event_id
        and registration_id is null
      order by created_at asc
      for update skip locked
      limit 1
    );
  end if;

  return v_registration_id;
exception
  when unique_violation then
    -- event_registrations_event_person_key (20260901010000) is the one that
    -- fires here: one registration per known person per event. The email index
    -- can fire too, when a staffer already added this person to the event by
    -- hand under the same address, and it means the same thing to the reader.
    raise exception 'ALREADY_REGISTERED';
end;
$$;

comment on function public.register_myself_for_event(uuid, integer, text, text, text, text, inet, boolean, boolean, integer, boolean, text, text, text, text, boolean) is
  'Registers the signed-in caller for a published public event under their own people row (#1165). Never matches or creates a person: the record is auth.uid() on the request host, so this path cannot produce a duplicate. Corrections travel on the registration and are not written back to people. Asks the same self-reported "been here before?" question the anonymous form does (#1259), the same minors question (#685), takes the same participant waiver where one is in force (#686), and records the same photo and media consent where a scope is written (#599).';

revoke execute on function public.register_myself_for_event(uuid, integer, text, text, text, text, inet, boolean, boolean, integer, boolean, text, text, text, text, boolean) from public, anon;
grant execute on function public.register_myself_for_event(uuid, integer, text, text, text, text, inet, boolean, boolean, integer, boolean, text, text, text, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Changing your mind
-- ---------------------------------------------------------------------------
--
-- A CONSENT THAT CANNOT BE WITHDRAWN IS NOT CONSENT. That is the substantive
-- difference from the waiver, which is accepted once and stands: an acceptance
-- describes an act that happened, and photo consent describes a permission
-- that is either still given or is not.
--
-- `/terms` already promises a takedown route by email. This is the one that
-- does not depend on somebody reading a mailbox, and it reaches whoever has
-- claimed an account (#1160); an anonymous registrant still has the email
-- route and nothing here takes it away.
--
-- Functions rather than policies on the table, for the reason every reader in
-- #1163 is one: this table's only `update` policy requires events:manage, and
-- the grant behind it is table-level, so there is no column to carve out. More
-- to the point, somebody looking at their own registration has no reason to
-- hold events:view either. Both resolve the person themselves through
-- `my_constituent_person_id('events')`, so whose answer is read or written is
-- never the caller's to choose.

create function public.my_photo_consent(p_registration_id uuid)
returns table (
  asked boolean,
  consent boolean,
  consented_at timestamptz,
  consent_text text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    -- Whether this organization is asking *now*, which is not the same as
    -- whether it asked when this person registered. A tenant that has since
    -- written a scope should be able to collect an answer from somebody whose
    -- row says null, and one that has emptied it should not be offering a
    -- control that cannot be saved.
    exists (
      select 1
        from public.site_content sc
        cross join lateral jsonb_array_elements_text(sc.value) as p(paragraph)
       where sc.tenant_id = r.tenant_id
         and sc.key = 'events.photo_consent'
         and jsonb_typeof(sc.value) = 'array'
         and btrim(p.paragraph) <> ''
    ),
    r.photo_consent,
    r.photo_consent_at,
    r.photo_consent_text
  from public.event_registrations r
  where r.id = p_registration_id
    and r.person_id = public.my_constituent_person_id('events')
  limit 1;
$$;

comment on function public.my_photo_consent(uuid) is
  'The caller''s own photo and media consent for one of their registrations, or no rows (#599). `asked` says whether the organization is asking now, which is not the same as whether it asked when they registered -- a tenant that has since written a scope can collect an answer from a row whose columns are null.';

revoke execute on function public.my_photo_consent(uuid) from public, anon;
grant execute on function public.my_photo_consent(uuid) to authenticated;

create function public.set_my_photo_consent(
  p_registration_id uuid,
  p_consent boolean
) returns public.photo_consent_record
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person_id uuid := public.my_constituent_person_id('events');
  v_tenant_id uuid;
  v_photo public.photo_consent_record;
begin
  if v_person_id is null then
    raise exception 'NO_RECORD';
  end if;

  if p_consent is null then
    -- Withdrawing is `false`, not null. Null is "nobody asked", and offering a
    -- way to write it back would let somebody erase the record of having been
    -- asked -- which is the one thing the three states exist to keep straight.
    raise exception 'PHOTO_CONSENT_REQUIRED';
  end if;

  select r.tenant_id into v_tenant_id
    from public.event_registrations r
   where r.id = p_registration_id
     and r.person_id = v_person_id;

  if v_tenant_id is null then
    raise exception 'REGISTRATION_NOT_FOUND';
  end if;

  -- Re-snapshotted, not carried over: they are answering the scope as it reads
  -- today, and that is the text this answer was given against.
  v_photo := public.resolved_photo_consent(v_tenant_id, p_consent);

  if v_photo.consent_text is null then
    -- The organization has stopped asking. Refusing rather than quietly
    -- clearing the row: silently nulling it would destroy the record of a
    -- decline, and a decline is the answer with an operational job. The
    -- message points at the email route `/terms` promises.
    raise exception 'PHOTO_CONSENT_UNAVAILABLE';
  end if;

  update public.event_registrations
     set photo_consent = v_photo.consent,
         photo_consent_at = v_photo.consented_at,
         photo_consent_text = v_photo.consent_text
   where id = p_registration_id
     and person_id = v_person_id;

  return v_photo;
end;
$$;

comment on function public.set_my_photo_consent(uuid, boolean) is
  'Changes the caller''s own photo and media consent on one of their registrations, in either direction (#599). Re-stamps photo_consent_at and re-snapshots the organization''s scope as it reads now, because they are answering today''s words. Raises PHOTO_CONSENT_UNAVAILABLE where the organization has stopped asking, rather than clearing the row -- silently nulling a decline would destroy the record an organizer acts on. A consent that cannot be withdrawn is not consent, which is why this exists and no equivalent exists for the waiver.';

revoke execute on function public.set_my_photo_consent(uuid, boolean) from public, anon;
grant execute on function public.set_my_photo_consent(uuid, boolean) to authenticated;
