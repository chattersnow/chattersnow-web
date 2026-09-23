-- Per-event registration options (#1407)
-- ---------------------------------------------------------------------------
--
-- One optional single-choice question per event -- a prompt and an ordered
-- list of options -- answered per person in the party as COUNTS PER OPTION that
-- add up to party_size. "Use my own gear / need a ticket / need a ticket and
-- gear" is Chatter Snow's; "bring my own mat / need a mat" or "pickup /
-- delivery" is anybody else's. Nothing here knows what a lift ticket is.
--
-- AN EVENT WITH NO OPTIONS IS UNCHANGED. Both registration RPCs gain one
-- parameter that defaults to null, and an event with no rows below neither
-- asks nor refuses anything. That is every event that exists today.
--
-- CAPS ARE PER OPTION and are enforced under the same `for update` lock on the
-- event row the capacity check takes (20260907130000), so two registrations
-- racing for the last sponsor ticket queue behind each other and the second
-- one sums a table that already holds the first. The whole party still counts
-- against `events.capacity` as before; the cap is a second, narrower limit.
--
-- ANSWERS KEEP THE WORDS THEY WERE GIVEN AGAINST. Each count row copies the
-- option's label as shown, and loses only its pointer when an option is
-- removed, so renaming or deleting an option never rewrites an old answer.
--
-- STAFF ARE NOT CAPPED. The portal's add-registrant and walk-in paths insert
-- directly and have never been held to `events.capacity` either; an organizer
-- handing out an eleventh ticket they found is a decision, not a race. Their
-- counts are optional too -- a walk-in nobody asked is "not asked", exactly as
-- the minors question reads for one (#685).

-- ---------------------------------------------------------------------------
-- 1. Schema
-- ---------------------------------------------------------------------------

alter table public.events
  add column registration_options_prompt text
    constraint events_registration_options_prompt_length
      check (registration_options_prompt is null
             or (btrim(registration_options_prompt) <> '' and char_length(registration_options_prompt) <= 300));

comment on column public.events.registration_options_prompt is
  'The question an event''s registration options answer (#1407), e.g. "What do you need?". Null when the event has no options. Written only by save_event_registration_options().';

create table public.event_registration_options (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) default public.default_tenant_id(),
  event_id uuid not null,
  label text not null
    check (btrim(label) <> '' and char_length(label) <= 120),
  sort_order integer not null default 0,
  -- Null is uncapped. Zero is allowed and means "shown, but closed".
  cap integer check (cap is null or cap >= 0),
  created_at timestamptz not null default now(),
  constraint event_registration_options_tenant_id_id_key unique (tenant_id, id),
  constraint event_registration_options_event_fkey
    foreign key (tenant_id, event_id)
    references public.events (tenant_id, id) on delete cascade
);

create index event_registration_options_event_idx
  on public.event_registration_options (event_id, sort_order);

comment on table public.event_registration_options is
  'The choices of an event''s one registration question (#1407), in display order, each with an optional cap. Answered per person as counts in event_registration_option_counts. Written only by save_event_registration_options() and the tenant-defaults trigger on events.';

create table public.event_registration_option_counts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) default public.default_tenant_id(),
  registration_id uuid not null,
  -- Null once the option is removed from the event; the label below keeps
  -- the answer readable.
  option_id uuid,
  label text not null,
  sort_order integer not null default 0,
  -- Only positive counts are stored. A registration that answered has at
  -- least one row, because party_size is at least one.
  quantity integer not null check (quantity > 0),
  constraint event_registration_option_counts_registration_option_key
    unique (registration_id, option_id),
  constraint event_registration_option_counts_registration_fkey
    foreign key (tenant_id, registration_id)
    references public.event_registrations (tenant_id, id) on delete cascade,
  constraint event_registration_option_counts_option_fkey
    foreign key (tenant_id, option_id)
    references public.event_registration_options (tenant_id, id)
    on delete set null (option_id)
);

create index event_registration_option_counts_option_idx
  on public.event_registration_option_counts (option_id);

comment on table public.event_registration_option_counts is
  'How many people in a registration''s party chose each registration option (#1407). Sums to the registration''s party_size. The label is a copy of the option as shown, so a later rename or removal never rewrites the answer. Written only by apply_registration_option_counts(), through the registration RPCs, set_my_registration_option_counts() and set_registrant_option_counts().';

-- Read under the same permission as the registrants they describe; written
-- only by the definer functions below. The revoke comes first because a
-- hosted project's default privileges hand every new table to both roles
-- (20260911010000, section 4).
alter table public.event_registration_options enable row level security;
alter table public.event_registration_option_counts enable row level security;

revoke all on public.event_registration_options, public.event_registration_option_counts
  from public, anon, authenticated;
grant select on public.event_registration_options, public.event_registration_option_counts
  to authenticated;

create policy "event_registration_options select" on public.event_registration_options
  for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('events', 'view')
  );

create policy "event_registration_option_counts select" on public.event_registration_option_counts
  for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('events', 'view')
  );

-- Configuration is audited like the event it belongs to. The counts are not:
-- they are part of a registration, and the registration is the record.
insert into public.audited_tables (table_name, pk_column) values
  ('event_registration_options', 'id');

create trigger audit_log_row after insert or update or delete
  on public.event_registration_options
  for each row execute function public.audit_log_row();

-- ---------------------------------------------------------------------------
-- 2. What the public form reads
-- ---------------------------------------------------------------------------

create view public.public_event_registration_options
with (security_barrier = true) as
select
  o.id,
  o.event_id,
  o.label,
  o.sort_order,
  e.registration_options_prompt as prompt,
  -- Whether the option is closed, and nothing about how close it is.
  (o.cap is not null
   and coalesce((select sum(c.quantity) from public.event_registration_option_counts c
                  where c.option_id = o.id), 0) >= o.cap) as is_full
from public.event_registration_options o
join public.events e on e.id = o.event_id and e.tenant_id = o.tenant_id
where e.visibility = 'public'
  and e.status = 'published'
  and o.tenant_id = public.public_tenant_id();

comment on view public.public_event_registration_options is
  'The registration options of the resolved tenant''s published public events (#1407), with the event''s prompt and whether each option is full. Security definer by design (#887): neither table has an anon select policy, and the public form reads as anon. Isolation is tenant_id = public_tenant_id() plus the visibility/status filters; the cap itself and the counts behind is_full stay out of the column list.';

revoke all on public.public_event_registration_options from public, anon, authenticated;
grant select on public.public_event_registration_options to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Writing an answer
-- ---------------------------------------------------------------------------

-- The one place counts are validated and written, so no two paths can
-- disagree about what adds up or what is full.
--
-- p_counts is a JSON object of option id -> whole number, zeros allowed:
-- {"<option uuid>": 2, "<option uuid>": 1}. Null or {} is "no answer".
--
--   p_required      refuse "no answer" when the event has options
--                   (EVENT_OPTIONS_REQUIRED). Off for staff.
--   p_enforce_caps  refuse a count that would take a capped option past its
--                   cap (EVENT_OPTION_FULL). Off for staff.
--
-- Called after the registration row exists, inside the caller's transaction,
-- so any refusal rolls the registration back with it.
create function public.apply_registration_option_counts(
  p_tenant_id uuid,
  p_event_id uuid,
  p_registration_id uuid,
  p_party_size integer,
  p_counts jsonb,
  p_required boolean,
  p_enforce_caps boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_has_options boolean;
  v_answered boolean;
  v_total bigint;
  v_full_label text;
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
       and coalesce((
             select sum(c.quantity) from public.event_registration_option_counts c
              where c.option_id = o.id and c.registration_id <> p_registration_id
           ), 0) + (e.value::text)::numeric::integer > o.cap
     order by o.sort_order
     limit 1;

    if v_full_label is not null then
      raise exception 'EVENT_OPTION_FULL';
    end if;
  end if;

  delete from public.event_registration_option_counts
   where registration_id = p_registration_id and tenant_id = p_tenant_id;

  insert into public.event_registration_option_counts
    (tenant_id, registration_id, option_id, label, sort_order, quantity)
  select p_tenant_id, p_registration_id, o.id, o.label, o.sort_order, (e.value::text)::numeric::integer
    from jsonb_each(p_counts) as e(key, value)
    join public.event_registration_options o
      on o.id::text = lower(e.key) and o.event_id = p_event_id and o.tenant_id = p_tenant_id
   where (e.value::text)::numeric::integer > 0;
end;
$$;

comment on function public.apply_registration_option_counts(uuid, uuid, uuid, integer, jsonb, boolean, boolean) is
  'Validates and writes one registration''s answer to its event''s registration options (#1407): an object of option id -> count, summing to the party size. Raises EVENT_OPTIONS_REQUIRED, EVENT_OPTIONS_INVALID, EVENT_OPTIONS_MISMATCH or EVENT_OPTION_FULL. Internal: called by the registration RPCs and the two set_* functions, never by a client.';

revoke execute on function public.apply_registration_option_counts(uuid, uuid, uuid, integer, jsonb, boolean, boolean)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. The two registration RPCs, each with one more parameter
-- ---------------------------------------------------------------------------
--
-- Bodies are 20260922070000's (register_for_event) and 20260923080000's
-- (register_myself_for_event) unchanged, plus the call after the insert.

drop function public.register_for_event(uuid, text, text, text, integer, text, text, inet, text, text, boolean, boolean, integer, boolean, text, text, text, text, boolean);

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
  p_option_counts jsonb default null
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
     photo_consent, photo_consent_at, photo_consent_text)
  values
    (v_tenant_id, p_event_id, p_name, p_email, p_phone, p_party_size, p_notes, v_person_id, p_instagram_handle, v_pronouns, p_attended_before,
     case when v_waiver_version is null then null else now() end, v_waiver_version,
     p_party_includes_minor, v_minor.accompanying_adult_name, v_minor.accompanying_adult_phone,
     v_minor.emergency_contact_name, v_minor.emergency_contact_phone,
     v_photo.consent, v_photo.consented_at, v_photo.consent_text)
  returning id into v_registration_id;

  -- #1407. After the insert, so the counts have a row to hang off; a refusal
  -- here rolls the registration back with it.
  perform public.apply_registration_option_counts(
    v_tenant_id, p_event_id, v_registration_id, p_party_size, p_option_counts, true, true
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

comment on function public.register_for_event(uuid, text, text, text, integer, text, text, inet, text, text, boolean, boolean, integer, boolean, text, text, text, text, boolean, jsonb) is
  'Anonymous public registration for a published public event. Asks every registrant whether they have been before (#1259) and whether their party includes anyone under 18 (#685), and stores both answers verbatim, null included; nothing it does varies with whether the email matched a directory record. A "yes" to the minors question must arrive with an accompanying adult and an emergency contact or it raises MINOR_CONTACTS_REQUIRED; an unanswered question is accepted, because the public API''s published contract predates it. Where the tenant has a participant waiver in force (#686), acceptance is required and the version accepted is recorded on the registration. Where the tenant has written a photo and media consent scope (#599), the answer is recorded with a snapshot of that scope -- a decline included, and a decline never refuses the registration. Where the event has registration options (#1407), p_option_counts is required and must add up to the party size, and a capped option is refused once full.';

grant execute on function public.register_for_event(uuid, text, text, text, integer, text, text, inet, text, text, boolean, boolean, integer, boolean, text, text, text, text, boolean, jsonb) to anon, authenticated;

drop function public.register_myself_for_event(uuid, integer, text, text, text, text, inet, boolean, boolean, integer, boolean, text, text, text, text, boolean);

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
  p_option_counts jsonb default null
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
     photo_consent, photo_consent_at, photo_consent_text)
  values
    (v_tenant_id, p_event_id, v_person.display_name, v_person.email,
     nullif(btrim(coalesce(p_phone, '')), ''), p_party_size,
     nullif(btrim(coalesce(p_notes, '')), ''), v_person_id, v_handle, v_pronouns,
     p_attended_before, v_waiver_accepted_at, v_waiver_version,
     p_party_includes_minor, v_minor.accompanying_adult_name, v_minor.accompanying_adult_phone,
     v_minor.emergency_contact_name, v_minor.emergency_contact_phone,
     v_photo.consent, v_photo.consented_at, v_photo.consent_text)
  returning id into v_registration_id;

  -- #1407, as on the anonymous path and through the same function.
  perform public.apply_registration_option_counts(
    v_tenant_id, p_event_id, v_registration_id, p_party_size, p_option_counts, true, true
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

comment on function public.register_myself_for_event(uuid, integer, text, text, text, text, inet, boolean, boolean, integer, boolean, text, text, text, text, boolean, jsonb) is
  'Registers the signed-in caller for a published public event under their own people row (#1165). Never matches or creates a person: the record is auth.uid() on the request host, so this path cannot produce a duplicate. Corrections travel on the registration and are not written back to people. Asks the same self-reported "been here before?" question the anonymous form does (#1259), the same minors question (#685), takes the same participant waiver where one is in force (#686) -- or reuses the caller''s acceptance of that version already on file, copying its version and date onto the registration, and puts a fresh acceptance on file (#1401) -- records the same photo and media consent where a scope is written (#599), and takes the same registration-option counts where the event has options (#1407).';

revoke execute on function public.register_myself_for_event(uuid, integer, text, text, text, text, inet, boolean, boolean, integer, boolean, text, text, text, text, boolean, jsonb) from public, anon;
grant execute on function public.register_myself_for_event(uuid, integer, text, text, text, text, inet, boolean, boolean, integer, boolean, text, text, text, text, boolean, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Changing an answer afterwards
-- ---------------------------------------------------------------------------

-- The registrant's own, from /my/registration/[id]. Resolves the person
-- itself, like set_my_photo_consent(), so whose row is written is never the
-- caller's to choose. Held to the caps like a new registration, and open only
-- while registration is: past the deadline the organizer is ordering tickets.
create function public.set_my_registration_option_counts(
  p_registration_id uuid,
  p_counts jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person_id uuid := public.my_constituent_person_id('events');
  v_registration record;
begin
  if v_person_id is null then
    raise exception 'NO_RECORD';
  end if;

  select r.tenant_id, r.event_id, r.party_size, e.registration_enabled, e.registration_deadline
    into v_registration
    from public.event_registrations r
    join public.events e on e.id = r.event_id and e.tenant_id = r.tenant_id
   where r.id = p_registration_id
     and r.person_id = v_person_id;

  if not found then
    raise exception 'REGISTRATION_NOT_FOUND';
  end if;

  if not v_registration.registration_enabled then
    raise exception 'REGISTRATION_CLOSED';
  end if;

  if v_registration.registration_deadline is not null and v_registration.registration_deadline < now() then
    raise exception 'REGISTRATION_DEADLINE_PASSED';
  end if;

  perform public.apply_registration_option_counts(
    v_registration.tenant_id, v_registration.event_id, p_registration_id,
    v_registration.party_size, p_counts, true, true
  );
end;
$$;

comment on function public.set_my_registration_option_counts(uuid, jsonb) is
  'Changes the signed-in caller''s own answer to an event''s registration options (#1407), for a registration of theirs, while registration for the event is still open. Held to the same sum and caps as registering.';

revoke execute on function public.set_my_registration_option_counts(uuid, jsonb) from public, anon;
grant execute on function public.set_my_registration_option_counts(uuid, jsonb) to authenticated;

-- What /my/registration/[id] shows: every current option of the event, the
-- caller's count against it, and how many they could hold. Nothing for a
-- registration that is not theirs, the same silence my_photo_consent() keeps.
create function public.my_registration_option_counts(p_registration_id uuid)
returns table (
  option_id uuid,
  label text,
  prompt text,
  quantity integer,
  -- The most this registration can hold: cap less everybody else's. Null is
  -- uncapped.
  available integer,
  party_size integer,
  editable boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select
    o.id,
    o.label,
    e.registration_options_prompt,
    coalesce(mine.quantity, 0),
    case when o.cap is null then null
         else greatest(o.cap - coalesce((
           select sum(c.quantity) from public.event_registration_option_counts c
            where c.option_id = o.id and c.registration_id <> r.id
         ), 0), 0)::integer
    end,
    r.party_size,
    e.registration_enabled
      and (e.registration_deadline is null or e.registration_deadline >= now())
  from public.event_registrations r
  join public.events e on e.id = r.event_id and e.tenant_id = r.tenant_id
  join public.event_registration_options o on o.event_id = e.id and o.tenant_id = e.tenant_id
  left join public.event_registration_option_counts mine
    on mine.registration_id = r.id and mine.option_id = o.id
  where r.id = p_registration_id
    and r.person_id = public.my_constituent_person_id('events')
  order by o.sort_order, o.label;
$$;

comment on function public.my_registration_option_counts(uuid) is
  'The signed-in caller''s own answer to an event''s registration options (#1407): each current option with their count, how many they could hold under its cap, and whether registration is still open for changes. No rows for a registration that is not theirs or an event with no options.';

revoke execute on function public.my_registration_option_counts(uuid) from public, anon;
grant execute on function public.my_registration_option_counts(uuid) to authenticated;

-- Staff, from the portal's add-registrant and walk-in dialogs. Optional and
-- uncapped -- see the header.
create function public.set_registrant_option_counts(
  p_registration_id uuid,
  p_counts jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_registration record;
begin
  if not public.has_permission('events', 'manage') then
    raise exception 'Not authorized to edit registrations';
  end if;

  select tenant_id, event_id, party_size
    into v_registration
    from public.event_registrations
   where id = p_registration_id
     and tenant_id = (select public.current_tenant_id());

  if not found then
    raise exception 'REGISTRANT_NOT_FOUND';
  end if;

  perform public.apply_registration_option_counts(
    v_registration.tenant_id, v_registration.event_id, p_registration_id,
    v_registration.party_size, p_counts, false, false
  );
end;
$$;

comment on function public.set_registrant_option_counts(uuid, jsonb) is
  'Staff recording a registration''s answer to its event''s registration options (#1407). Requires events: manage. Unlike the public paths an answer is optional -- null or {} clears it -- and caps are not enforced, as events.capacity is not for staff-added registrants.';

revoke execute on function public.set_registrant_option_counts(uuid, jsonb) from public, anon;
grant execute on function public.set_registrant_option_counts(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Setting the options up
-- ---------------------------------------------------------------------------

-- Replaces an event's question in one call: p_options is the whole list in
-- display order, [{"id": uuid|null, "label": text, "cap": int|null}, ...].
-- An existing id is updated in place, so its counts keep pointing at it; an
-- id left out is removed, and its counts keep their label. An empty list
-- removes the question.
create function public.save_event_registration_options(
  p_event_id uuid,
  p_prompt text,
  p_options jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := (select public.current_tenant_id());
  v_prompt text := nullif(btrim(coalesce(p_prompt, '')), '');
  v_option jsonb;
  v_index integer := 0;
  v_id uuid;
  v_label text;
  v_cap integer;
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

    v_id := null;
    if nullif(v_option->>'id', '') is not null then
      update public.event_registration_options
         set label = v_label, cap = v_cap, sort_order = v_index
       where id::text = lower(v_option->>'id')
         and event_id = p_event_id
         and tenant_id = v_tenant_id
      returning id into v_id;
    end if;

    if v_id is null then
      insert into public.event_registration_options (tenant_id, event_id, label, cap, sort_order)
      values (v_tenant_id, p_event_id, v_label, v_cap, v_index)
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
$$;

comment on function public.save_event_registration_options(uuid, text, jsonb) is
  'Replaces an event''s registration question and its options (#1407) in one call, in display order. Existing ids are updated in place; ids left out are removed, and their counts keep the label they were answered against. Requires events: manage. Raises EVENT_OPTIONS_INVALID, EVENT_OPTIONS_TOO_MANY (more than 10), EVENT_OPTIONS_PROMPT_REQUIRED or EVENT_OPTIONS_DUPLICATE.';

revoke execute on function public.save_event_registration_options(uuid, text, jsonb) from public, anon;
grant execute on function public.save_event_registration_options(uuid, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Tenant defaults
-- ---------------------------------------------------------------------------
--
-- `events.registration_option_defaults` in app_settings:
--   {"prompt": "What do you need?", "options": [{"label": "...", "cap": null}, ...]}
-- copied onto every new event of that tenant, whichever path creates it. Once
-- copied they are the event's own, edited on its Planning tab.

create function public.registration_option_defaults(p_tenant_id uuid)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select s.value
    from public.app_settings s
   where s.tenant_id = p_tenant_id
     and s.key = 'events.registration_option_defaults'
     and jsonb_typeof(s.value) = 'object'
     and jsonb_typeof(s.value->'options') = 'array'
     and jsonb_array_length(s.value->'options') > 0
     and nullif(btrim(coalesce(s.value->>'prompt', '')), '') is not null;
$$;

comment on function public.registration_option_defaults(uuid) is
  'A tenant''s default registration question for new events (#1407), from app_settings key events.registration_option_defaults, or null when it has none (or an unusable one). Internal: read by the events insert trigger.';

revoke execute on function public.registration_option_defaults(uuid) from public, anon, authenticated;

create function public.apply_registration_option_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_defaults jsonb := public.registration_option_defaults(new.tenant_id);
begin
  if v_defaults is null or new.registration_options_prompt is not null then
    return null;
  end if;

  insert into public.event_registration_options (tenant_id, event_id, label, cap, sort_order)
  select new.tenant_id, new.id, btrim(o.value->>'label'),
         case when jsonb_typeof(o.value->'cap') = 'number' then greatest((o.value->>'cap')::numeric::integer, 0) end,
         (o.ordinality - 1)::integer
    from jsonb_array_elements(v_defaults->'options') with ordinality as o(value, ordinality)
   where nullif(btrim(coalesce(o.value->>'label', '')), '') is not null
   limit 10;

  if found then
    update public.events
       set registration_options_prompt = btrim(v_defaults->>'prompt')
     where id = new.id and tenant_id = new.tenant_id;
  end if;

  return null;
end;
$$;

revoke execute on function public.apply_registration_option_defaults() from public, anon, authenticated;

create trigger apply_registration_option_defaults
  after insert on public.events
  for each row execute function public.apply_registration_option_defaults();
