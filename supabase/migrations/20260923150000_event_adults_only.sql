-- #1417: a per-event Adults only (18+) setting, and a registration
-- confirmation that everyone in the party is 18 or over.
--
-- Nothing like it existed. `events.adults_only` is off by default, so every
-- existing event is unchanged. On:
--
--   * public_events exposes it, for the 18+ badge on the card, the detail
--     page and the sheet header.
--   * Both registration RPCs refuse a registration without
--     p_adults_only_confirmed = true (ADULTS_ONLY_CONFIRMATION_REQUIRED),
--     and record when it was given on event_registrations.adults_only_confirmed_at,
--     so staff can see it in registrant detail.
--   * The under-18 question (#685, #1416) is never asked: the RPCs discard the
--     answer and contacts exactly as they do for a tenant that has it off.
--
-- Off, the confirmation is ignored and null is stored. Nothing about the
-- event changes after the fact for a registration already taken: the
-- timestamp records what the registrant confirmed, and turning the setting
-- off later leaves it standing.
--
-- The RPCs gain a trailing defaulted parameter, so they are dropped and
-- recreated with 20260923140000's bodies but for the #1417 lines, and their
-- grants restated.

-- ---------------------------------------------------------------------------
-- 1. The columns
-- ---------------------------------------------------------------------------

alter table public.events
  add column adults_only boolean not null default false;

comment on column public.events.adults_only is
  'Adults only (18+) (#1417). On, the public site shows an 18+ badge and registration requires every registrant to confirm everyone in their party is 18 or over, and never asks the under-18 question. Off by default.';

alter table public.event_registrations
  add column adults_only_confirmed_at timestamptz;

comment on column public.event_registrations.adults_only_confirmed_at is
  'When the registrant confirmed everyone in their party is 18 or over, for an adults-only event (#1417). Null for every other registration, and for one staff added by hand. Set only by the registration RPCs.';

-- event_registrations is read through column grants since 20260922040000, so
-- a new column is invisible to the portal until it is named. Readable like
-- party_includes_minor, and for the same reason: the door shift needs it.
grant select (adults_only_confirmed_at) on public.event_registrations to authenticated;

-- ---------------------------------------------------------------------------
-- 2. The public view
-- ---------------------------------------------------------------------------

-- The column appended at the end, as `create or replace view` requires.
-- `create or replace` replaces the view's options with the ones given, so
-- 20260911010000's security_barrier is restated; the owner, grants and
-- comment carry over.
create or replace view public.public_events with (security_barrier = true) as
select
  id, name, location, starts_at, ends_at, timezone, description, capacity,
  registration_enabled, registration_deadline, flier_url, adults_only
from public.events
where visibility = 'public'
  and status = 'published'
  and tenant_id = public.public_tenant_id();

-- ---------------------------------------------------------------------------
-- 3. The registration RPCs
-- ---------------------------------------------------------------------------

drop function public.register_for_event(uuid, text, text, text, integer, text, text, inet, text, text, boolean, boolean, integer, boolean, text, text, text, text, boolean, jsonb, text, text, text, text);

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
  p_photo_consent boolean default null,
  p_option_counts jsonb default null,
  p_riding_discipline text default null,
  p_ski_experience_level text default null,
  p_snowboard_experience_level text default null,
  p_preferred_mountain text default null,
  p_adults_only_confirmed boolean default null
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

  select capacity, registration_enabled, registration_deadline, auto_assign_discount_codes, adults_only
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
  -- #1416. A tenant that does not ask has not been answered: null, the
  -- column's "nobody was asked", and no contacts -- whatever arrived.
  -- #1417. An 18+ event never asks the under-18 question, whatever the
  -- tenant setting says: the confirmation below is its answer.
  if v_event.adults_only or not public.tenant_asks_about_minors(v_tenant_id) then
    p_party_includes_minor := null;
  end if;

  -- #1417. After the honeypot, like the waiver: a bot learns nothing about
  -- the event from being refused. Only `true` confirms; an unanswered box is
  -- a refusal, not an unanswered question, because the event says adults
  -- only and a registration without the confirmation is one it never takes.
  if v_event.adults_only and p_adults_only_confirmed is not true then
    raise exception 'ADULTS_ONLY_CONFIRMATION_REQUIRED';
  end if;

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

  -- #1407. A capped option needs the lock below as much as a capped event,
  -- and it has to be taken here, before the insert: the insert's foreign key
  -- takes a share lock on the event row, and two registrations each holding
  -- one while waiting to update it would deadlock.
  if v_event.capacity is null and exists (
    select 1 from public.event_registration_options
     where event_id = p_event_id and tenant_id = v_tenant_id and cap is not null
  ) then
    perform 1 from public.events
     where id = p_event_id and tenant_id = v_tenant_id
     for update;
  end if;

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
     photo_consent, photo_consent_at, photo_consent_text,
     adults_only_confirmed_at)
  values
    (v_tenant_id, p_event_id, p_name, p_email, p_phone, p_party_size, p_notes, v_person_id, p_instagram_handle, v_pronouns, p_attended_before,
     case when v_waiver_version is null then null else now() end, v_waiver_version,
     p_party_includes_minor, v_minor.accompanying_adult_name, v_minor.accompanying_adult_phone,
     v_minor.emergency_contact_name, v_minor.emergency_contact_phone,
     v_photo.consent, v_photo.consented_at, v_photo.consent_text,
     case when v_event.adults_only then now() end)
  returning id into v_registration_id;

  -- #1407. After the insert, so the counts have a row to hang off; a refusal
  -- here rolls the registration back with it.
  perform public.apply_registration_option_counts(
    v_tenant_id, p_event_id, v_registration_id, p_party_size, p_option_counts, true, true
  );

  -- #1415. The riding answers, on the person and in this transaction: a
  -- refusal here rolls the registration back with it, and one that passes
  -- cannot leave a registration without the answers it was made with.
  perform public.apply_registration_rider_profile(
    v_tenant_id, v_person_id,
    p_riding_discipline, p_ski_experience_level, p_snowboard_experience_level, p_preferred_mountain
  );

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

comment on function public.register_for_event(uuid, text, text, text, integer, text, text, inet, text, text, boolean, boolean, integer, boolean, text, text, text, text, boolean, jsonb, text, text, text, text, boolean) is
  'Anonymous public registration for a published public event. Asks every registrant whether they have been before (#1259) and whether their party includes anyone under 18 (#685) -- unless the tenant has turned that question off (#1416), when the answer and contacts are ignored and null is stored --, and stores both answers verbatim, null included; nothing it does varies with whether the email matched a directory record. A "yes" to the minors question must arrive with an accompanying adult and an emergency contact or it raises MINOR_CONTACTS_REQUIRED; an unanswered question is accepted, because the public API''s published contract predates it. Where the tenant has a participant waiver in force (#686), acceptance is required and the version accepted is recorded on the registration. Where the tenant has written a photo and media consent scope (#599), the answer is recorded with a snapshot of that scope -- a decline included, and a decline never refuses the registration. Where the event has registration options (#1407), p_option_counts is required and must add up to the party size, and a capped option is refused once full. Where the tenant has the rider_profile module, the riding answers are validated and written to the person (#1415); an unanswered discipline writes nothing. Where the event is adults only (#1417), the under-18 question is not asked, p_adults_only_confirmed must be true or it raises ADULTS_ONLY_CONFIRMATION_REQUIRED, and the confirmation is recorded as adults_only_confirmed_at.';

grant execute on function public.register_for_event(uuid, text, text, text, integer, text, text, inet, text, text, boolean, boolean, integer, boolean, text, text, text, text, boolean, jsonb, text, text, text, text, boolean) to anon, authenticated;

drop function public.register_myself_for_event(uuid, integer, text, text, text, text, inet, boolean, boolean, integer, boolean, text, text, text, text, boolean, jsonb, text, text, text, text);

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
  p_photo_consent boolean default null,
  p_option_counts jsonb default null,
  p_riding_discipline text default null,
  p_ski_experience_level text default null,
  p_snowboard_experience_level text default null,
  p_preferred_mountain text default null,
  p_adults_only_confirmed boolean default null
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
  v_waiver_accepted_at timestamptz;
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

  select capacity, registration_enabled, registration_deadline, auto_assign_discount_codes, adults_only
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
  -- #1416. A tenant that does not ask has not been answered: null, the
  -- column's "nobody was asked", and no contacts -- whatever arrived.
  -- #1417. An 18+ event never asks the under-18 question, whatever the
  -- tenant setting says: the confirmation below is its answer.
  if v_event.adults_only or not public.tenant_asks_about_minors(v_tenant_id) then
    p_party_includes_minor := null;
  end if;

  -- #1417. After the honeypot, like the waiver: a bot learns nothing about
  -- the event from being refused. Only `true` confirms; an unanswered box is
  -- a refusal, not an unanswered question, because the event says adults
  -- only and a registration without the confirmation is one it never takes.
  if v_event.adults_only and p_adults_only_confirmed is not true then
    raise exception 'ADULTS_ONLY_CONFIRMATION_REQUIRED';
  end if;

  v_minor := public.resolve_minor_contacts(
    p_party_includes_minor,
    p_accompanying_adult_name,
    p_accompanying_adult_phone,
    p_emergency_contact_name,
    p_emergency_contact_phone
  );

  -- #1401. An unticked box is fine when this person already accepted the
  -- version in force: the form showed them a one-line summary instead of the
  -- agreement, and the registration copies what is on file.
  if p_waiver_accepted is not true then
    select f.version, f.accepted_at
      into v_waiver_version, v_waiver_accepted_at
      from public.waiver_on_file(v_tenant_id, v_person_id) f;

    -- Nothing on file for the version in force, but the form says it showed
    -- one: the agreement was republished after the page rendered the summary.
    -- "Tick the box" would name a box they were never shown, so say what
    -- happened instead.
    if v_waiver_version is null
       and p_waiver_version is not null
       and exists (
         select 1 from public.legal_document_versions v
          where v.tenant_id = v_tenant_id
            and v.document = 'waiver'
            and v.version > p_waiver_version
       ) then
      raise exception 'WAIVER_CHANGED';
    end if;
  end if;

  -- Otherwise asked of a signed-in caller exactly as it is of an anonymous
  -- one. Holding an account is not agreement to anything: the waiver is about
  -- taking part, and a path around it would be the shortest way to a
  -- registration with no acceptance behind it.
  if v_waiver_version is null then
    v_waiver_version := public.accepted_waiver_version(
      v_tenant_id, p_waiver_accepted, p_waiver_version
    );

    if v_waiver_version is not null then
      v_waiver_accepted_at := now();
      -- On file from here on. A second acceptance of a version already there
      -- keeps the first date: that is when they first agreed to it.
      insert into public.person_waiver_acceptances (tenant_id, person_id, version, accepted_at)
      values (v_tenant_id, v_person_id, v_waiver_version, v_waiver_accepted_at)
      on conflict (tenant_id, person_id, version) do nothing;
    end if;
  end if;

  -- And the same question again, through the same resolver, for the reason it
  -- is shared: two paths that could disagree about consent would disagree
  -- silently, one recording permission the other would have declined (#599).
  v_photo := public.resolved_photo_consent(v_tenant_id, p_photo_consent);

  -- #1407, and before the insert for the reason register_for_event() gives.
  if v_event.capacity is null and exists (
    select 1 from public.event_registration_options
     where event_id = p_event_id and tenant_id = v_tenant_id and cap is not null
  ) then
    perform 1 from public.events
     where id = p_event_id and tenant_id = v_tenant_id
     for update;
  end if;

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
     photo_consent, photo_consent_at, photo_consent_text,
     adults_only_confirmed_at)
  values
    (v_tenant_id, p_event_id, v_person.display_name, v_person.email,
     nullif(btrim(coalesce(p_phone, '')), ''), p_party_size,
     nullif(btrim(coalesce(p_notes, '')), ''), v_person_id, v_handle, v_pronouns,
     p_attended_before, v_waiver_accepted_at, v_waiver_version,
     p_party_includes_minor, v_minor.accompanying_adult_name, v_minor.accompanying_adult_phone,
     v_minor.emergency_contact_name, v_minor.emergency_contact_phone,
     v_photo.consent, v_photo.consented_at, v_photo.consent_text,
     case when v_event.adults_only then now() end)
  returning id into v_registration_id;

  -- #1407, as on the anonymous path and through the same function.
  perform public.apply_registration_option_counts(
    v_tenant_id, p_event_id, v_registration_id, p_party_size, p_option_counts, true, true
  );

  -- #1415. The riding answers, on the person and in this transaction: a
  -- refusal here rolls the registration back with it, and one that passes
  -- cannot leave a registration without the answers it was made with.
  perform public.apply_registration_rider_profile(
    v_tenant_id, v_person_id,
    p_riding_discipline, p_ski_experience_level, p_snowboard_experience_level, p_preferred_mountain
  );

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
    -- person_waiver_acceptances cannot: its insert is `on conflict do nothing`.
    raise exception 'ALREADY_REGISTERED';
end;
$$;

comment on function public.register_myself_for_event(uuid, integer, text, text, text, text, inet, boolean, boolean, integer, boolean, text, text, text, text, boolean, jsonb, text, text, text, text, boolean) is
  'Registers the signed-in caller for a published public event under their own people row (#1165). Never matches or creates a person: the record is auth.uid() on the request host, so this path cannot produce a duplicate. Corrections travel on the registration and are not written back to people -- except the riding answers, which describe the person rather than this attendance and are written to them where the tenant has the rider_profile module (#1415). Asks the same self-reported "been here before?" question the anonymous form does (#1259), the same minors question (#685) where the tenant asks it (#1416), takes the same participant waiver where one is in force (#686) -- or reuses the caller''s acceptance of that version already on file, copying its version and date onto the registration, and puts a fresh acceptance on file (#1401) -- records the same photo and media consent where a scope is written (#599), and takes the same registration-option counts where the event has options (#1407), and requires and records the same adults-only confirmation where the event is 18+ (#1417).';

revoke execute on function public.register_myself_for_event(uuid, integer, text, text, text, text, inet, boolean, boolean, integer, boolean, text, text, text, text, boolean, jsonb, text, text, text, text, boolean) from public, anon;
grant execute on function public.register_myself_for_event(uuid, integer, text, text, text, text, inet, boolean, boolean, integer, boolean, text, text, text, text, boolean, jsonb, text, text, text, text, boolean) to authenticated;
