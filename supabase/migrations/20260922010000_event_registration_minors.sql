-- Does the party include anyone under 18, and who is bringing them (#685)
-- ---------------------------------------------------------------------------
--
-- `/code-of-conduct` and `/terms` have said for months that somebody under 18
-- takes part only with a parent or guardian, and nothing in the product knew
-- whether one was coming. `event_registrations` recorded a party size, so a
-- party of four could be one adult and three children and the first anyone
-- found out was at the mountain, where the only choices left are turning a
-- family away or ignoring the rule the organization published.
--
-- WHAT IS HERE IS THE MECHANISM, NOT THE RULE. The platform asks the question,
-- collects an adult who can be reached on the day and an emergency contact,
-- and says what it does with them -- all facts about this software. What an
-- organization *requires* (who must accompany, whether that adult registers
-- and counts in the party size, whether there is a minimum age at all) is that
-- organization's claim, and `docs/legal-basis.md` rule 2 keeps it out of a
-- default. It lives in the `events.minor_accompaniment` content slot, blank
-- until somebody writes it, exactly like `get_involved.volunteer_screening`
-- (#690). A tenant that has adopted nothing shows nothing and promises
-- nothing; the registration is still flagged for its organizers.
--
-- NOTHING IS ACCEPTED HERE. #1318 stands: the paragraphs are notice, there is
-- no checkbox and no stored pointer to a version. The one box on this form
-- that carries a real choice is the participant agreement's (#686), and a
-- second box nobody can decline would dilute it.
--
-- THREE STATES, AND ONLY ONE OF THEM IS A "NO". `party_includes_minor` is
-- nullable and null means NOBODY WAS ASKED: every row written before this,
-- every walk-in and staff-added registrant, and every caller of
-- /api/v1/t/{tenant}/events/{event}/registrations, whose published contract
-- (`docs/public-api.md`) cannot be made to answer a new question
-- retroactively. Both public forms require an answer; the RPCs require only
-- that an answer of "yes" arrives with the four contacts, which is the rule a
-- platform that degrades can actually hold.

alter table public.event_registrations
  add column party_includes_minor boolean,
  add column accompanying_adult_name text,
  add column accompanying_adult_phone text,
  add column emergency_contact_name text,
  add column emergency_contact_phone text,
  -- ONE-DIRECTIONAL ON PURPOSE. It says the contacts may exist only where the
  -- answer was yes; it does not say they must. The biconditional would be the
  -- obvious shape and would break retention permanently: the purge nulls
  -- personal columns in place and leaves the flag alone, so a row anonymized
  -- three years on would raise 23514 inside `run_retention_purge()`, whose own
  -- `exception when others` swallows it into a skipped log row -- event
  -- registrations would then never anonymize again, with a log line as the
  -- only evidence. Presence on the way in is enforced in the two RPCs, which
  -- is where it can say something a reader can act on rather than a 23514
  -- (the same argument NAME_REQUIRED is written under, 20260919030000).
  add constraint event_registrations_minor_contacts_scope
    check (
      party_includes_minor is true
      or (accompanying_adult_name is null
          and accompanying_adult_phone is null
          and emergency_contact_name is null
          and emergency_contact_phone is null)
    );

comment on column public.event_registrations.party_includes_minor is
  'Whether this registrant said their party includes anyone under 18 (#685). Null means NOBODY WAS ASKED -- a row written before this shipped, a walk-in or staff-added registrant, or a public API caller -- and must never be read as "no", which is the whole failure this column exists to prevent. Survives retention anonymization beside party_size and checked_in_at: it is a fact about the party, not the registrant''s personal data.';

comment on column public.event_registrations.accompanying_adult_name is
  'The adult attending with the minors in this party (#685). Collected only where party_includes_minor is true. Cleared by the retention purge with the other personal fields. Not a claim that this organization requires one: what it requires is its own events.minor_accompaniment text.';

comment on column public.event_registrations.accompanying_adult_phone is
  'A number that reaches the accompanying adult on the day (#685). Carried as typed -- nothing in this schema normalizes a phone (20260916100000). Cleared by the retention purge.';

comment on column public.event_registrations.emergency_contact_name is
  'Who to call about this party in an emergency (#685). The only personal data this product holds about somebody who never visited the site, which is why the form asks the registrant to tell them. Cleared by the retention purge.';

comment on column public.event_registrations.emergency_contact_phone is
  'The emergency contact''s number (#685). Carried as typed. Cleared by the retention purge.';

-- ---------------------------------------------------------------------------
-- Who can read the four contacts
-- ---------------------------------------------------------------------------
--
-- The flag is for every organizer; the contacts are not. A rider's preferred
-- discipline is gated in TypeScript alone (`registrants-actions.ts` selects
-- the columns or does not), and for a riding preference that was an acceptable
-- cost -- the columns were still readable with a direct PostgREST call by
-- anybody holding `events:view`. A child's guardian's mobile number is a
-- different call, so this one is a privilege rather than a convention.
--
-- Postgres tracks table-level and column-level grants separately and a
-- table-level SELECT cannot have a column carved out of it, so the table grant
-- goes and an explicit column list replaces it. The four are absent from that
-- list, which is the point, and `event-registration-minor-contacts.integration.test.ts`
-- fails if a later column is added without one -- a new column that nobody
-- grants disappears from the portal, which is the safe direction to fail but a
-- confusing one to debug.
revoke select on public.event_registrations from authenticated;

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
  created_at
) on public.event_registrations to authenticated;

-- The four, for the roles that need them. Security definer by default (a view
-- is, unless `security_invoker` says otherwise), which is how it reaches past
-- the revoke above -- so it does its own tenant isolation and its own
-- permission check, exactly as `org_notification_settings` does
-- (20260916140000).
create or replace view public.event_registration_minor_contacts as
select
  r.id as registration_id,
  r.event_id,
  r.accompanying_adult_name,
  r.accompanying_adult_phone,
  r.emergency_contact_name,
  r.emergency_contact_phone
from public.event_registrations r
where r.tenant_id = public.current_tenant_id()
  and public.has_permission('events', 'manage')
  and r.party_includes_minor is true;

comment on view public.event_registration_minor_contacts is
  'The accompanying-adult and emergency contacts on registrations whose party includes a minor (#685), for holders of events:manage only. Security definer by design: the columns are revoked from `authenticated` on the table itself, so this view is the only way to them, and it carries its own tenant isolation (current_tenant_id()) and its own permission check rather than borrowing the table''s events:view policy.';

grant select on public.event_registration_minor_contacts to authenticated;

-- ---------------------------------------------------------------------------
-- What the two registration paths ask
-- ---------------------------------------------------------------------------
--
-- One resolver, called by both, so the anonymous form and the signed-in form
-- cannot start disagreeing about what a complete answer is -- the shape
-- `accepted_waiver_version()` established one migration ago.

create type public.minor_accompaniment_contacts as (
  accompanying_adult_name text,
  accompanying_adult_phone text,
  emergency_contact_name text,
  emergency_contact_phone text
);

comment on type public.minor_accompaniment_contacts is
  'The four contacts a registration carries when its party includes a minor (#685). A composite type rather than four out-parameters so that resolve_minor_contacts() has one return value the two RPCs destructure identically.';

create function public.resolve_minor_contacts(
  p_includes_minor boolean,
  p_adult_name text,
  p_adult_phone text,
  p_emergency_name text,
  p_emergency_phone text
) returns public.minor_accompaniment_contacts
language plpgsql
immutable
as $$
declare
  v public.minor_accompaniment_contacts;
begin
  -- Not true covers both "no" and unanswered, and both mean the same thing
  -- here: nothing about an accompanying adult may be stored. A reader who
  -- answered yes, filled the fields in and changed their mind must not leave
  -- a guardian's number behind them, and a caller that sends contacts with a
  -- "no" is refused by the column constraint rather than trusted.
  if p_includes_minor is not true then
    return v;
  end if;

  v.accompanying_adult_name := nullif(btrim(coalesce(p_adult_name, '')), '');
  v.accompanying_adult_phone := nullif(btrim(coalesce(p_adult_phone, '')), '');
  v.emergency_contact_name := nullif(btrim(coalesce(p_emergency_name, '')), '');
  v.emergency_contact_phone := nullif(btrim(coalesce(p_emergency_phone, '')), '');

  if v.accompanying_adult_name is null
     or v.accompanying_adult_phone is null
     or v.emergency_contact_name is null
     or v.emergency_contact_phone is null then
    raise exception 'MINOR_CONTACTS_REQUIRED';
  end if;

  return v;
end;
$$;

comment on function public.resolve_minor_contacts(boolean, text, text, text, text) is
  'Resolves what a registration should record about an accompanying adult and an emergency contact (#685). Returns four nulls unless the answer was yes, and raises MINOR_CONTACTS_REQUIRED when a yes arrives incomplete. Shared by register_for_event() and register_myself_for_event() so the two paths cannot disagree about what a complete answer is.';

revoke execute on function public.resolve_minor_contacts(boolean, text, text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Anonymous registration
-- ---------------------------------------------------------------------------
--
-- Five trailing parameters change the signature, so this drops before
-- recreating (see 20260826190000's note). The body is otherwise unchanged from
-- 20260922000000.
drop function public.register_for_event(uuid, text, text, text, integer, text, text, inet, text, text, boolean, boolean, integer);

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
  p_emergency_contact_phone text default null
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
  -- record somebody asked us to keep.
  insert into public.event_registrations
    (tenant_id, event_id, name, email, phone, party_size, notes, person_id, instagram_handle, pronouns, attended_before,
     waiver_accepted_at, waiver_version,
     party_includes_minor, accompanying_adult_name, accompanying_adult_phone, emergency_contact_name, emergency_contact_phone)
  values
    (v_tenant_id, p_event_id, p_name, p_email, p_phone, p_party_size, p_notes, v_person_id, p_instagram_handle, v_pronouns, p_attended_before,
     case when v_waiver_version is null then null else now() end, v_waiver_version,
     p_party_includes_minor, v_minor.accompanying_adult_name, v_minor.accompanying_adult_phone,
     v_minor.emergency_contact_name, v_minor.emergency_contact_phone)
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

comment on function public.register_for_event(uuid, text, text, text, integer, text, text, inet, text, text, boolean, boolean, integer, boolean, text, text, text, text) is
  'Anonymous public registration for a published public event. Asks every registrant whether they have been before (#1259) and whether their party includes anyone under 18 (#685), and stores both answers verbatim, null included; nothing it does varies with whether the email matched a directory record. A "yes" to the minors question must arrive with an accompanying adult and an emergency contact or it raises MINOR_CONTACTS_REQUIRED; an unanswered question is accepted, because the public API''s published contract predates it. Where the tenant has a participant waiver in force (#686), acceptance is required and the version accepted is recorded on the registration.';

grant execute on function public.register_for_event(uuid, text, text, text, integer, text, text, inet, text, text, boolean, boolean, integer, boolean, text, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Registering as yourself
-- ---------------------------------------------------------------------------
--
-- Body otherwise unchanged from 20260922000000.
drop function public.register_myself_for_event(uuid, integer, text, text, text, text, inet, boolean, boolean, integer);

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
  p_emergency_contact_phone text default null
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
     emergency_contact_name, emergency_contact_phone)
  values
    (v_tenant_id, p_event_id, v_person.display_name, v_person.email,
     nullif(btrim(coalesce(p_phone, '')), ''), p_party_size,
     nullif(btrim(coalesce(p_notes, '')), ''), v_person_id, v_handle, v_pronouns,
     p_attended_before, case when v_waiver_version is null then null else now() end,
     v_waiver_version,
     p_party_includes_minor, v_minor.accompanying_adult_name, v_minor.accompanying_adult_phone,
     v_minor.emergency_contact_name, v_minor.emergency_contact_phone)
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

comment on function public.register_myself_for_event(uuid, integer, text, text, text, text, inet, boolean, boolean, integer, boolean, text, text, text, text) is
  'Registers the signed-in caller for a published public event under their own people row (#1165). Never matches or creates a person: the record is auth.uid() on the request host, so this path cannot produce a duplicate. Corrections travel on the registration and are not written back to people. Asks the same self-reported "been here before?" question the anonymous form does (#1259) and the same minors question (#685), and takes the same participant waiver where one is in force (#686).';

revoke execute on function public.register_myself_for_event(uuid, integer, text, text, text, text, inet, boolean, boolean, integer, boolean, text, text, text, text) from public, anon;
grant execute on function public.register_myself_for_event(uuid, integer, text, text, text, text, inet, boolean, boolean, integer, boolean, text, text, text, text) to authenticated;
