-- #1589: shared group discount codes, partner PINs, prices on registration
-- options, and the discount value a code offers.
--
-- 1. discount_codes gains `shared` and `pin`. A shared code is the one code a
--    partner hands out for everybody who registers for an event; it is never
--    held by a registration, at most one exists per event, and the
--    registration confirmation email carries it (and its PIN) to every
--    registrant. Assigning one, by hand or by auto-assign, is refused. The PIN
--    is the partner's redemption secret, not one of ours: it is plain text
--    because it has to be shown and emailed, and it is read under the same
--    events:view as the code itself.
--
-- 2. event_registration_options gains an optional `price`, and each count row
--    copies it the way it copies the label, so editing a price never changes
--    what a past registration was offered. A registration that edits its
--    answer keeps the price it first copied for an option it already held.
--
-- 3. discount_code_options says which options a code covers, and by what
--    percentage. A bundled option is discounted on its whole copied price.
--
-- 4. The impact RPCs return what "discount value offered" is derived from:
--    every shared code and every code held by a registrant who did not cancel,
--    with what each covers, and the priced option counts of registrations that
--    were not cancelled. The figure is computed in
--    src/lib/portal/impact-metrics.ts. It is not assistance: redemption
--    happens on the partner's site, and a shared code goes to everyone.
--
-- register_for_event, register_myself_for_event and restore_event_registration
-- are otherwise 20261001100000's and 20260923160000's: auto-assign skips a
-- shared code. apply_registration_option_counts and
-- save_event_registration_options are otherwise 20260923100000's.
-- get_event_impact_derived_data and get_program_impact_rollup_data are
-- otherwise 20261011230000's.

-- 1. Shared codes and PINs ----------------------------------------------------

alter table public.discount_codes
  add column shared boolean not null default false,
  add column pin text
    constraint discount_codes_pin_length
      check (pin is null or (btrim(pin) <> '' and char_length(pin) <= 64)),
  add constraint discount_codes_shared_never_assigned
    check (not shared or (registration_id is null and assigned_at is null and sent_at is null)),
  add constraint discount_codes_tenant_id_id_key unique (tenant_id, id);

create unique index discount_codes_one_shared_per_event
  on public.discount_codes (event_id)
  where shared;

comment on column public.discount_codes.shared is
  'The event''s one group code, given to everyone who registers (#1589). Never assigned to a registration; the registration confirmation email carries it.';
comment on column public.discount_codes.pin is
  'The partner''s PIN for redeeming this code, where it asks for one (#1589). Shown and emailed with the code, so stored as plain text.';

-- 2. Option prices ------------------------------------------------------------

alter table public.event_registration_options
  add column price numeric(10, 2)
    constraint event_registration_options_price_check check (price >= 0);

comment on column public.event_registration_options.price is
  'What the option costs, where it has a price (#1589). Not shown on the public form. Copied onto each count row at registration.';

alter table public.event_registration_option_counts
  add column price numeric(10, 2)
    constraint event_registration_option_counts_price_check check (price >= 0);

comment on column public.event_registration_option_counts.price is
  'The option''s price when this registration chose it (#1589), so a later price change never rewrites what it was offered.';

-- 3. What a code covers -------------------------------------------------------

create table public.discount_code_options (
  tenant_id uuid not null references public.tenants(id) default public.default_tenant_id(),
  code_id uuid not null,
  option_id uuid not null,
  percent_off numeric(5, 2) not null
    constraint discount_code_options_percent_off_check
      check (percent_off > 0 and percent_off <= 100),
  created_at timestamptz not null default now(),
  primary key (code_id, option_id),
  constraint discount_code_options_code_fkey
    foreign key (tenant_id, code_id)
    references public.discount_codes (tenant_id, id) on delete cascade,
  constraint discount_code_options_option_fkey
    foreign key (tenant_id, option_id)
    references public.event_registration_options (tenant_id, id) on delete cascade
);

create index discount_code_options_option_idx
  on public.discount_code_options (option_id);

comment on table public.discount_code_options is
  'The registration options a discount code covers, and by what percentage (#1589). With the option prices copied onto count rows, this is what the discount value a code offers is derived from.';

alter table public.discount_code_options enable row level security;

revoke all on public.discount_code_options from public, anon, authenticated;
grant select, insert, update, delete on public.discount_code_options to authenticated;

create policy "discount_code_options select" on public.discount_code_options
  for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('events', 'view')
  );
create policy "discount_code_options insert" on public.discount_code_options
  for insert to authenticated
  with check (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('events', 'manage')
  );
create policy "discount_code_options update" on public.discount_code_options
  for update to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('events', 'manage')
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('events', 'manage')
  );
create policy "discount_code_options delete" on public.discount_code_options
  for delete to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('events', 'manage')
  );

-- A code may only cover its own event's options. A composite foreign key
-- cannot say that, since the code row names its event and the option row
-- names its own.
create function public.discount_code_options_same_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
      from public.discount_codes dc
      join public.event_registration_options o
        on o.event_id = dc.event_id and o.tenant_id = dc.tenant_id
     where dc.id = new.code_id
       and o.id = new.option_id
       and dc.tenant_id = new.tenant_id
  ) then
    raise exception 'DISCOUNT_CODE_OPTION_EVENT_MISMATCH';
  end if;
  return new;
end;
$$;

revoke execute on function public.discount_code_options_same_event() from public, anon, authenticated;

create trigger discount_code_options_same_event
  before insert or update on public.discount_code_options
  for each row execute function public.discount_code_options_same_event();

-- 4. Functions ----------------------------------------------------------------


CREATE OR REPLACE FUNCTION public.register_for_event(p_event_id uuid, p_name text, p_email text, p_phone text, p_party_size integer, p_notes text, p_honeypot text DEFAULT NULL::text, p_ip_address inet DEFAULT NULL::inet, p_instagram_handle text DEFAULT NULL::text, p_pronouns text DEFAULT NULL::text, p_attended_before boolean DEFAULT NULL::boolean, p_waiver_accepted boolean DEFAULT false, p_waiver_version integer DEFAULT NULL::integer, p_party_includes_minor boolean DEFAULT NULL::boolean, p_accompanying_adult_name text DEFAULT NULL::text, p_accompanying_adult_phone text DEFAULT NULL::text, p_emergency_contact_name text DEFAULT NULL::text, p_emergency_contact_phone text DEFAULT NULL::text, p_photo_consent boolean DEFAULT NULL::boolean, p_option_counts jsonb DEFAULT NULL::jsonb, p_riding_discipline text DEFAULT NULL::text, p_ski_experience_level text DEFAULT NULL::text, p_snowboard_experience_level text DEFAULT NULL::text, p_preferred_mountain text DEFAULT NULL::text, p_adults_only_confirmed boolean DEFAULT NULL::boolean, p_answers jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

    -- #1418. A cancelled registration holds no seats.
    select coalesce(sum(party_size), 0) into v_existing_party_size
    from public.event_registrations
    where event_id = p_event_id
      and cancelled_at is null;

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

  -- #1501. After the insert, like the counts above, and through the same
  -- function every other path uses; a refusal rolls the registration back.
  perform public.apply_registration_answers(
    v_tenant_id, p_event_id, v_registration_id, p_answers, true
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
        -- #1589: the shared code is everyone's, never one registration's.
        and not shared
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
$function$
;

CREATE OR REPLACE FUNCTION public.register_myself_for_event(p_event_id uuid, p_party_size integer, p_notes text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_pronouns text DEFAULT NULL::text, p_instagram_handle text DEFAULT NULL::text, p_ip_address inet DEFAULT NULL::inet, p_attended_before boolean DEFAULT NULL::boolean, p_waiver_accepted boolean DEFAULT false, p_waiver_version integer DEFAULT NULL::integer, p_party_includes_minor boolean DEFAULT NULL::boolean, p_accompanying_adult_name text DEFAULT NULL::text, p_accompanying_adult_phone text DEFAULT NULL::text, p_emergency_contact_name text DEFAULT NULL::text, p_emergency_contact_phone text DEFAULT NULL::text, p_photo_consent boolean DEFAULT NULL::boolean, p_option_counts jsonb DEFAULT NULL::jsonb, p_riding_discipline text DEFAULT NULL::text, p_ski_experience_level text DEFAULT NULL::text, p_snowboard_experience_level text DEFAULT NULL::text, p_preferred_mountain text DEFAULT NULL::text, p_adults_only_confirmed boolean DEFAULT NULL::boolean, p_answers jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

    -- #1418. A cancelled registration holds no seats.
    select coalesce(sum(party_size), 0) into v_existing_party_size
    from public.event_registrations
    where event_id = p_event_id
      and cancelled_at is null;

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

  -- #1501. After the insert, like the counts above, and through the same
  -- function every other path uses; a refusal rolls the registration back.
  perform public.apply_registration_answers(
    v_tenant_id, p_event_id, v_registration_id, p_answers, true
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
        -- #1589: the shared code is everyone's, never one registration's.
        and not shared
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
$function$
;

CREATE OR REPLACE FUNCTION public.restore_event_registration(p_registration_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tenant_id uuid := (select public.current_tenant_id());
  v_registration record;
  v_event record;
  v_taken bigint;
begin
  if not public.has_permission('events', 'manage') then
    raise exception 'Not authorized to restore registrations';
  end if;

  select r.event_id, r.party_size, r.cancelled_at
    into v_registration
    from public.event_registrations r
   where r.id = p_registration_id
     and r.tenant_id = v_tenant_id;

  if not found then
    raise exception 'REGISTRANT_NOT_FOUND';
  end if;

  if v_registration.cancelled_at is null then
    raise exception 'REGISTRATION_NOT_CANCELLED';
  end if;

  -- The lock the registration RPCs take, so an undo and a registration racing
  -- for the last seat queue behind each other.
  select capacity, auto_assign_discount_codes
    into v_event
    from public.events
   where id = v_registration.event_id
     and tenant_id = v_tenant_id
     for update;

  if v_event.capacity is not null then
    select coalesce(sum(party_size), 0) into v_taken
      from public.event_registrations
     where event_id = v_registration.event_id
       and cancelled_at is null;

    if v_taken + v_registration.party_size > v_event.capacity then
      raise exception 'EVENT_AT_CAPACITY';
    end if;
  end if;

  if exists (
    select 1
      from public.event_registration_option_counts mine
      join public.event_registration_options o
        on o.id = mine.option_id and o.tenant_id = mine.tenant_id
     where mine.registration_id = p_registration_id
       and o.cap is not null
       and mine.quantity + coalesce((
             select sum(c.quantity)
               from public.event_registration_option_counts c
               join public.event_registrations r on r.id = c.registration_id
              where c.option_id = o.id
                and r.cancelled_at is null
           ), 0) > o.cap
  ) then
    raise exception 'EVENT_OPTION_FULL';
  end if;

  update public.event_registrations
     set cancelled_at = null,
         cancelled_by = null,
         cancellation_reason = null,
         cancellation_note = null
   where id = p_registration_id
     and tenant_id = v_tenant_id;

  -- Its released code went back to the pool; a fresh one, where the event
  -- hands them out and it holds none.
  if v_event.auto_assign_discount_codes and not exists (
    select 1 from public.discount_codes where registration_id = p_registration_id
  ) then
    update public.discount_codes
       set registration_id = p_registration_id,
           assigned_at = now()
     where id = (
       select id
         from public.discount_codes
        where event_id = v_registration.event_id
          and tenant_id = v_tenant_id
          and registration_id is null
          -- #1589: the shared code is everyone's, never one registration's.
          and not shared
        order by created_at asc
        for update skip locked
        limit 1
     );
  end if;
exception
  when unique_violation then
    -- The same person or address registered again after this was cancelled.
    raise exception 'ALREADY_REGISTERED';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.apply_registration_option_counts(p_tenant_id uuid, p_event_id uuid, p_registration_id uuid, p_party_size integer, p_counts jsonb, p_required boolean, p_enforce_caps boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_has_options boolean;
  v_answered boolean;
  v_total bigint;
  v_full_label text;
  v_copied_prices jsonb;
begin
  select exists (
    select 1 from public.event_registration_options
     where event_id = p_event_id and tenant_id = p_tenant_id
  ) into v_has_options;

  v_answered := p_counts is not null
    and jsonb_typeof(p_counts) <> 'null'
    and p_counts <> '{}'::jsonb;

  if not v_answered then
    if v_has_options and p_required then
      raise exception 'EVENT_OPTIONS_REQUIRED';
    end if;
    delete from public.event_registration_option_counts
     where registration_id = p_registration_id and tenant_id = p_tenant_id;
    return;
  end if;

  if jsonb_typeof(p_counts) <> 'object' or not v_has_options then
    raise exception 'EVENT_OPTIONS_INVALID';
  end if;

  -- Every key an option of this event, every value a whole number >= 0.
  -- Compared as text so a malformed key is a refusal rather than a cast error.
  if exists (
    select 1
      from jsonb_each(p_counts) as e(key, value)
      left join public.event_registration_options o
        on o.id::text = lower(e.key)
       and o.event_id = p_event_id
       and o.tenant_id = p_tenant_id
     where o.id is null
        -- A CASE, not an OR chain: SQL does not promise to test the type
        -- before attempting the cast.
        or case when jsonb_typeof(e.value) = 'number'
                then (e.value::text)::numeric not between 0 and 10000
                     or (e.value::text)::numeric <> trunc((e.value::text)::numeric)
                else true
           end
  ) then
    raise exception 'EVENT_OPTIONS_INVALID';
  end if;

  select coalesce(sum((e.value::text)::numeric), 0)
    into v_total
    from jsonb_each(p_counts) as e(key, value);

  if v_total <> p_party_size then
    raise exception 'EVENT_OPTIONS_MISMATCH';
  end if;

  if p_enforce_caps and exists (
    select 1 from public.event_registration_options o
     where o.event_id = p_event_id and o.tenant_id = p_tenant_id and o.cap is not null
  ) then
    -- The capacity check's lock, taken here too: concurrent registrations
    -- queue, and each one sums counts that include the ones ahead of it.
    -- The registration RPCs already hold it by now -- they must take it
    -- before inserting (see there) -- so this acquires it only for the
    -- set_my_ path, which inserts no registration first.
    perform 1 from public.events
     where id = p_event_id and tenant_id = p_tenant_id
     for update;

    -- Only an INCREASE is refused. A registration keeping what it already
    -- holds -- editing another option, or an option staff took past its cap
    -- -- is not a new claim on the cap.
    select o.label into v_full_label
      from jsonb_each(p_counts) as e(key, value)
      join public.event_registration_options o
        on o.id::text = lower(e.key) and o.event_id = p_event_id and o.tenant_id = p_tenant_id
     where o.cap is not null
       and (e.value::text)::numeric::integer > coalesce((
             select c.quantity from public.event_registration_option_counts c
              where c.registration_id = p_registration_id and c.option_id = o.id
           ), 0)
       -- #1418. Only active registrations hold a cap.
       and coalesce((
             select sum(c.quantity) from public.event_registration_option_counts c
               join public.event_registrations r on r.id = c.registration_id
              where c.option_id = o.id and c.registration_id <> p_registration_id
                and r.cancelled_at is null
           ), 0) + (e.value::text)::numeric::integer > o.cap
     order by o.sort_order
     limit 1;

    if v_full_label is not null then
      raise exception 'EVENT_OPTION_FULL';
    end if;
  end if;

  -- #1589: the price an option had when this registration first chose it.
  -- Changing an answer later must not reprice what it already held.
  select coalesce(jsonb_object_agg(option_id::text, price), '{}'::jsonb)
    into v_copied_prices
    from public.event_registration_option_counts
   where registration_id = p_registration_id
     and tenant_id = p_tenant_id
     and option_id is not null;

  delete from public.event_registration_option_counts
   where registration_id = p_registration_id and tenant_id = p_tenant_id;

  insert into public.event_registration_option_counts
    (tenant_id, registration_id, option_id, label, sort_order, quantity, price)
  select p_tenant_id, p_registration_id, o.id, o.label, o.sort_order, (e.value::text)::numeric::integer,
         case when v_copied_prices ? o.id::text
              then (v_copied_prices->>o.id::text)::numeric
              else o.price end
    from jsonb_each(p_counts) as e(key, value)
    join public.event_registration_options o
      on o.id::text = lower(e.key) and o.event_id = p_event_id and o.tenant_id = p_tenant_id
   where (e.value::text)::numeric::integer > 0;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.save_event_registration_options(p_event_id uuid, p_prompt text, p_options jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tenant_id uuid := (select public.current_tenant_id());
  v_prompt text := nullif(btrim(coalesce(p_prompt, '')), '');
  v_option jsonb;
  v_index integer := 0;
  v_id uuid;
  v_label text;
  v_cap integer;
  v_price numeric;
  v_kept uuid[] := '{}';
begin
  if not public.has_permission('events', 'manage') then
    raise exception 'Not authorized to edit events';
  end if;

  perform 1 from public.events
   where id = p_event_id and tenant_id = v_tenant_id
   for update;
  if not found then
    raise exception 'EVENT_NOT_FOUND';
  end if;

  if p_options is null or jsonb_typeof(p_options) <> 'array' then
    raise exception 'EVENT_OPTIONS_INVALID';
  end if;

  if jsonb_array_length(p_options) > 10 then
    raise exception 'EVENT_OPTIONS_TOO_MANY';
  end if;

  if jsonb_array_length(p_options) > 0 and v_prompt is null then
    raise exception 'EVENT_OPTIONS_PROMPT_REQUIRED';
  end if;

  if (select count(distinct lower(btrim(o->>'label'))) from jsonb_array_elements(p_options) o)
     <> jsonb_array_length(p_options) then
    raise exception 'EVENT_OPTIONS_DUPLICATE';
  end if;

  for v_option in select value from jsonb_array_elements(p_options) loop
    v_label := btrim(coalesce(v_option->>'label', ''));
    if v_label = '' or char_length(v_label) > 120 then
      raise exception 'EVENT_OPTIONS_INVALID';
    end if;

    if v_option->'cap' is null or jsonb_typeof(v_option->'cap') = 'null' then
      v_cap := null;
    elsif (case when jsonb_typeof(v_option->'cap') = 'number'
                then (v_option->>'cap')::numeric = trunc((v_option->>'cap')::numeric)
                     and (v_option->>'cap')::numeric between 0 and 100000
                else false
           end) then
      v_cap := (v_option->>'cap')::numeric::integer;
    else
      raise exception 'EVENT_OPTIONS_INVALID';
    end if;

    -- #1589
    if v_option->'price' is null or jsonb_typeof(v_option->'price') = 'null' then
      v_price := null;
    elsif (case when jsonb_typeof(v_option->'price') = 'number'
                then (v_option->>'price')::numeric between 0 and 99999999.99
                     and (v_option->>'price')::numeric = round((v_option->>'price')::numeric, 2)
                else false
           end) then
      v_price := (v_option->>'price')::numeric;
    else
      raise exception 'EVENT_OPTIONS_INVALID';
    end if;

    v_id := null;
    if nullif(v_option->>'id', '') is not null then
      update public.event_registration_options
         set label = v_label, cap = v_cap, price = v_price, sort_order = v_index
       where id::text = lower(v_option->>'id')
         and event_id = p_event_id
         and tenant_id = v_tenant_id
      returning id into v_id;
    end if;

    if v_id is null then
      insert into public.event_registration_options (tenant_id, event_id, label, cap, price, sort_order)
      values (v_tenant_id, p_event_id, v_label, v_cap, v_price, v_index)
      returning id into v_id;
    end if;

    v_kept := v_kept || v_id;
    v_index := v_index + 1;
  end loop;

  delete from public.event_registration_options
   where event_id = p_event_id
     and tenant_id = v_tenant_id
     and not (id = any (v_kept));

  update public.events
     set registration_options_prompt = case when v_index = 0 then null else v_prompt end
   where id = p_event_id and tenant_id = v_tenant_id;
end;
$function$
;

comment on function public.save_event_registration_options(uuid, text, jsonb) is
  'Replaces an event''s registration question and its options (#1407) in one call, in display order, each with an optional cap and price (#1589). Existing ids are updated in place; ids left out are removed, and their counts keep the label and price they were answered against. Requires events: manage. Raises EVENT_OPTIONS_INVALID, EVENT_OPTIONS_TOO_MANY (more than 10), EVENT_OPTIONS_PROMPT_REQUIRED or EVENT_OPTIONS_DUPLICATE.';

CREATE OR REPLACE FUNCTION public.get_event_impact_derived_data(p_event_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_can_view_impact boolean;
  v_result jsonb;
  v_event_id uuid;
begin
  v_can_view_impact := public.has_permission('event_impact', 'view');

  if not (v_can_view_impact or public.has_permission('events', 'view')) then
    raise exception 'Not authorized to view event impact figures';
  end if;

  select id into v_event_id
    from public.events
   where id = p_event_id
     and tenant_id = (select public.current_tenant_id());

  select jsonb_build_object(
    'event_id', p_event_id,
    'auto_assign_discount_codes', coalesce((
      select auto_assign_discount_codes from public.events where id = v_event_id
    ), false),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'event_id', id,
        'attendance_count', attendance_count
      ))
      from public.events
      where id = v_event_id
    ), '[]'::jsonb),
    'registrations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'person_id', person_id,
        'event_id', event_id,
        'checked_in_at', checked_in_at
      ))
      from public.event_registrations
      where event_id = v_event_id
        -- #1418
        and cancelled_at is null
    ), '[]'::jsonb),
    'checkin_counts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'person_id', person_id,
        'checked_in_event_count', checked_in_event_count
      ))
      from (
        select person_id, count(*) as checked_in_event_count
        from public.event_registrations
        where checked_in_at is not null
          and person_id = any(
            select distinct person_id
            from public.event_registrations
            where event_id = v_event_id
              and checked_in_at is not null
              and person_id is not null
          )
        group by person_id
      ) per_person
    ), '[]'::jsonb),
    'event_volunteers', coalesce((
      select jsonb_agg(jsonb_build_object('event_id', event_id, 'person_id', person_id))
      from public.event_volunteers
      where event_id = v_event_id and person_id is not null
    ), '[]'::jsonb),
    'volunteer_hour_people', coalesce((
      select jsonb_agg(jsonb_build_object('event_id', event_id, 'person_id', person_id))
      from (
        select distinct event_id, person_id
        from public.volunteer_hours
        where event_id = v_event_id
      ) vh
    ), '[]'::jsonb),
    -- #1577: people served. Every caller of this function may see it; the
    -- recipient ids only ever leave as a count.
    'distributions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'event_id', mov.event_id,
        'quantity', mov.quantity,
        'recipient_person_id', mov.recipient_person_id,
        'inventory_item_id', mov.inventory_item_id,
        'face_value', items.face_value
      ))
      from public.inventory_movements mov
      join public.inventory_items items on items.id = mov.inventory_item_id
      where mov.event_id = v_event_id
        and mov.movement_type = 'distributed'
    ), '[]'::jsonb),
    -- #1588: kind and value, and only codes held by a registrant who did not
    -- cancel -- a cancelled registrant's code helped nobody.
    'discount_codes', case when v_can_view_impact then coalesce((
      select jsonb_agg(jsonb_build_object(
        'event_id', dc.event_id,
        'registration_id', dc.registration_id,
        'kind', dc.kind,
        'value', dc.value
      ))
      from public.discount_codes dc
      join public.event_registrations reg on reg.id = dc.registration_id
      where dc.event_id = v_event_id and reg.cancelled_at is null
    ), '[]'::jsonb) else null::jsonb end,
    -- #1588: paid expenses tagged as participant assistance. Amounts only.
    'assistance_expenses', case when v_can_view_impact then coalesce((
      select jsonb_agg(jsonb_build_object(
        'event_id', exps.event_id,
        'amount', exps.amount
      ))
      from public.event_expenses exps
      where exps.event_id = v_event_id
        and exps.participant_assistance
        and exps.status = 'paid'
    ), '[]'::jsonb) else null::jsonb end,
    -- #1588: checked-in attendees whose level was first time on snow, read
    -- the way beginner_attendees is.
    'first_time_attendees', case when v_can_view_impact then coalesce((
      select jsonb_agg(jsonb_build_object('event_id', event_id, 'person_id', person_id))
      from (
        select distinct r.event_id, r.person_id
        from public.event_registrations r
        join public.people p on p.id = r.person_id
        cross join lateral (
          select case when r.riding_discipline_at_event is not null
                      then r.ski_experience_level_at_event
                      else p.ski_experience_level end as ski_level,
                 case when r.riding_discipline_at_event is not null
                      then r.snowboard_experience_level_at_event
                      else p.snowboard_experience_level end as snowboard_level
        ) lvl
        where r.event_id = v_event_id
          and r.checked_in_at is not null
          and (lvl.ski_level = 'first_time' or lvl.snowboard_level = 'first_time')
      ) first_timers
    ), '[]'::jsonb) else null::jsonb end,
    'beginner_attendees', case when v_can_view_impact then coalesce((
      select jsonb_agg(jsonb_build_object('event_id', event_id, 'person_id', person_id))
      from (
        select distinct r.event_id, r.person_id
        from public.event_registrations r
        join public.people p on p.id = r.person_id
        cross join lateral (
          select case when r.riding_discipline_at_event is not null
                      then r.ski_experience_level_at_event
                      else p.ski_experience_level end as ski_level,
                 case when r.riding_discipline_at_event is not null
                      then r.snowboard_experience_level_at_event
                      else p.snowboard_experience_level end as snowboard_level
        ) lvl
        where r.event_id = v_event_id
          and r.checked_in_at is not null
          and (lvl.ski_level = 'beginner' or lvl.snowboard_level = 'beginner')
      ) beginners
    ), '[]'::jsonb) else null::jsonb end,
    'profiled_attendees', case when v_can_view_impact then coalesce((
      select jsonb_agg(jsonb_build_object('event_id', event_id, 'person_id', person_id))
      from (
        select distinct r.event_id, r.person_id
        from public.event_registrations r
        join public.people p on p.id = r.person_id
        cross join lateral (
          select case when r.riding_discipline_at_event is not null
                      then r.ski_experience_level_at_event
                      else p.ski_experience_level end as ski_level,
                 case when r.riding_discipline_at_event is not null
                      then r.snowboard_experience_level_at_event
                      else p.snowboard_experience_level end as snowboard_level
        ) lvl
        where r.event_id = v_event_id
          and r.checked_in_at is not null
          and (lvl.ski_level is not null or lvl.snowboard_level is not null)
      ) profiled
    ), '[]'::jsonb) else null::jsonb end,
    -- #1589: what the discount value offered is derived from. Every shared
    -- code, and every code held by a registrant who did not cancel, with the
    -- options it covers; and the priced answers of registrations that were
    -- not cancelled.
    'offered_codes', case when v_can_view_impact then coalesce((
      select jsonb_agg(jsonb_build_object(
        'event_id', dc.event_id,
        'code_id', dc.id,
        'shared', dc.shared,
        'registration_id', dc.registration_id,
        'value', dc.value,
        'options', coalesce((
          select jsonb_agg(jsonb_build_object(
            'option_id', dco.option_id,
            'percent_off', dco.percent_off,
            'price', o.price
          ))
          from public.discount_code_options dco
          join public.event_registration_options o on o.id = dco.option_id
          where dco.code_id = dc.id
        ), '[]'::jsonb)
      ))
      from public.discount_codes dc
      left join public.event_registrations reg on reg.id = dc.registration_id
      where dc.event_id = v_event_id
        and (dc.shared or (dc.registration_id is not null and reg.cancelled_at is null))
    ), '[]'::jsonb) else null::jsonb end,
    'option_counts', case when v_can_view_impact then coalesce((
      select jsonb_agg(jsonb_build_object(
        'event_id', reg.event_id,
        'registration_id', c.registration_id,
        'option_id', c.option_id,
        'quantity', c.quantity,
        'price', c.price
      ))
      from public.event_registration_option_counts c
      join public.event_registrations reg on reg.id = c.registration_id
      where reg.event_id = v_event_id
        and reg.cancelled_at is null
    ), '[]'::jsonb) else null::jsonb end
  ) into v_result;

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_program_impact_rollup_data(p_program_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_event_ids uuid[];
  v_result jsonb;
begin
  if not public.has_permission('programs_reports', 'view') then
    raise exception 'Not authorized to view program impact reports';
  end if;

  select coalesce(array_agg(event_id), '{}') into v_event_ids
  from public.event_programs
  where program_id = p_program_id
    and tenant_id = (select public.current_tenant_id());

  select jsonb_build_object(
    'event_ids', to_jsonb(v_event_ids),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'event_id', id,
        'attendance_count', attendance_count,
        'auto_assign_discount_codes', auto_assign_discount_codes
      ))
      from public.events
      where id = any(v_event_ids)
    ), '[]'::jsonb),
    -- #1588: impact_notes is gone. Its typed figures are archived, and adding
    -- them to the derived ones would count the same help twice.
    'assistance_expenses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'event_id', exps.event_id,
        'amount', exps.amount
      ))
      from public.event_expenses exps
      where exps.event_id = any(v_event_ids)
        and exps.participant_assistance
        and exps.status = 'paid'
    ), '[]'::jsonb),
    'first_time_attendees', coalesce((
      select jsonb_agg(jsonb_build_object('event_id', event_id, 'person_id', person_id))
      from (
        select distinct r.event_id, r.person_id
        from public.event_registrations r
        join public.people p on p.id = r.person_id
        cross join lateral (
          select case when r.riding_discipline_at_event is not null
                      then r.ski_experience_level_at_event
                      else p.ski_experience_level end as ski_level,
                 case when r.riding_discipline_at_event is not null
                      then r.snowboard_experience_level_at_event
                      else p.snowboard_experience_level end as snowboard_level
        ) lvl
        where r.event_id = any(v_event_ids)
          and r.checked_in_at is not null
          and (lvl.ski_level = 'first_time' or lvl.snowboard_level = 'first_time')
      ) first_timers
    ), '[]'::jsonb),
    'distributed_movements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'quantity', mov.quantity,
        'event_id', mov.event_id,
        'recipient_person_id', mov.recipient_person_id,
        'inventory_item_id', mov.inventory_item_id,
        'face_value', items.face_value
      ))
      from public.inventory_movements mov
      join public.inventory_items items on items.id = mov.inventory_item_id
      where mov.event_id = any(v_event_ids) and mov.movement_type = 'distributed'
    ), '[]'::jsonb),
    'volunteer_hours', coalesce((
      select jsonb_agg(jsonb_build_object('event_id', event_id, 'hours', hours))
      from public.volunteer_hours
      where event_id = any(v_event_ids)
    ), '[]'::jsonb),
    'event_volunteers', coalesce((
      select jsonb_agg(jsonb_build_object('event_id', event_id, 'person_id', person_id))
      from public.event_volunteers
      where event_id = any(v_event_ids) and person_id is not null
    ), '[]'::jsonb),
    'volunteer_hour_people', coalesce((
      select jsonb_agg(jsonb_build_object('event_id', event_id, 'person_id', person_id))
      from (
        select distinct event_id, person_id
        from public.volunteer_hours
        where event_id = any(v_event_ids)
      ) vh
    ), '[]'::jsonb),
    'beginner_attendees', coalesce((
      select jsonb_agg(jsonb_build_object('event_id', event_id, 'person_id', person_id))
      from (
        select distinct r.event_id, r.person_id
        from public.event_registrations r
        join public.people p on p.id = r.person_id
        cross join lateral (
          select case when r.riding_discipline_at_event is not null
                      then r.ski_experience_level_at_event
                      else p.ski_experience_level end as ski_level,
                 case when r.riding_discipline_at_event is not null
                      then r.snowboard_experience_level_at_event
                      else p.snowboard_experience_level end as snowboard_level
        ) lvl
        where r.event_id = any(v_event_ids)
          and r.checked_in_at is not null
          and (lvl.ski_level = 'beginner' or lvl.snowboard_level = 'beginner')
      ) beginners
    ), '[]'::jsonb),
    'profiled_attendees', coalesce((
      select jsonb_agg(jsonb_build_object('event_id', event_id, 'person_id', person_id))
      from (
        select distinct r.event_id, r.person_id
        from public.event_registrations r
        join public.people p on p.id = r.person_id
        cross join lateral (
          select case when r.riding_discipline_at_event is not null
                      then r.ski_experience_level_at_event
                      else p.ski_experience_level end as ski_level,
                 case when r.riding_discipline_at_event is not null
                      then r.snowboard_experience_level_at_event
                      else p.snowboard_experience_level end as snowboard_level
        ) lvl
        where r.event_id = any(v_event_ids)
          and r.checked_in_at is not null
          and (lvl.ski_level is not null or lvl.snowboard_level is not null)
      ) profiled
    ), '[]'::jsonb),
    'registrations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'person_id', person_id,
        'event_id', event_id,
        'checked_in_at', checked_in_at
      ))
      from public.event_registrations
      where event_id = any(v_event_ids)
        -- #1418
        and cancelled_at is null
    ), '[]'::jsonb),
    'checkin_counts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'person_id', person_id,
        'checked_in_event_count', checked_in_event_count
      ))
      from (
        select person_id, count(*) as checked_in_event_count
        from public.event_registrations
        where checked_in_at is not null
          and person_id = any(
            select distinct person_id
            from public.event_registrations
            where event_id = any(v_event_ids)
              and checked_in_at is not null
              and person_id is not null
          )
        group by person_id
      ) per_person
    ), '[]'::jsonb),
    'discount_codes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'event_id', dc.event_id,
        'registration_id', dc.registration_id,
        'kind', dc.kind,
        'value', dc.value
      ))
      from public.discount_codes dc
      join public.event_registrations reg on reg.id = dc.registration_id
      where dc.event_id = any(v_event_ids) and reg.cancelled_at is null
    ), '[]'::jsonb),
    -- #1589: what the discount value offered is derived from. Every shared
    -- code, and every code held by a registrant who did not cancel, with the
    -- options it covers; and the priced answers of registrations that were
    -- not cancelled.
    'offered_codes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'event_id', dc.event_id,
        'code_id', dc.id,
        'shared', dc.shared,
        'registration_id', dc.registration_id,
        'value', dc.value,
        'options', coalesce((
          select jsonb_agg(jsonb_build_object(
            'option_id', dco.option_id,
            'percent_off', dco.percent_off,
            'price', o.price
          ))
          from public.discount_code_options dco
          join public.event_registration_options o on o.id = dco.option_id
          where dco.code_id = dc.id
        ), '[]'::jsonb)
      ))
      from public.discount_codes dc
      left join public.event_registrations reg on reg.id = dc.registration_id
      where dc.event_id = any(v_event_ids)
        and (dc.shared or (dc.registration_id is not null and reg.cancelled_at is null))
    ), '[]'::jsonb),
    'option_counts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'event_id', reg.event_id,
        'registration_id', c.registration_id,
        'option_id', c.option_id,
        'quantity', c.quantity,
        'price', c.price
      ))
      from public.event_registration_option_counts c
      join public.event_registrations reg on reg.id = c.registration_id
      where reg.event_id = any(v_event_ids)
        and reg.cancelled_at is null
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$function$
;
