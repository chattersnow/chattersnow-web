-- #902: module gating reaches the public site.
--
-- #900 put module entitlements into has_permission(), my_permissions() and
-- people_with_permission(). All three are about a signed-in person in a tenant,
-- and the public site has neither a session nor a permission -- so a tenant
-- whose Inventory module is off still published a gear library at /gears, with
-- a working request form behind it.
--
-- Two halves here, and the second is the one that makes it a gate rather than a
-- hidden link:
--
--   1. `public_tenant_modules`, an anon-readable view answering for the tenant
--      the *host* resolves to, so src/lib/page-visibility.ts can force a slot
--      hidden when the module that owns it is off.
--   2. A module check inside every RPC `anon` can call. Hiding a page does not
--      stop a form post, and every one of these is reachable with curl.

-- ---------------------------------------------------------------------------
-- 1. Reading a module without a session
-- ---------------------------------------------------------------------------

-- tenant_module_enabled() (#900) resolves for current_tenant_id(), which is
-- membership-based and null for a visitor. The public site resolves its tenant
-- from the request host instead, so it needs a surface of its own -- the same
-- shape as public_page_visibility, public_site_content and the dozen other
-- public_* views, and like them a security-definer view owned by `postgres`,
-- which is what lets it read tenant_modules (RLS-scoped to a membership the
-- visitor does not have) and answer for the host's tenant instead.
--
-- The resolution order is module_enabled_for_tenant()'s, written out because a
-- view cannot call a function that takes the tenant and still be one statement
-- per row: the tenant's own row, else its plan's default, else the catalog
-- default. Fail open at every step, as #900 decided.
--
-- NOT folded into public_page_visibility, though that would save a round trip.
-- Doing it would require the slot -> module mapping in SQL, and the mapping
-- lives in PUBLIC_PAGE_SLOTS precisely so that adding a section is a TypeScript
-- edit and not a migration (see the registry's own comment). Splitting it
-- across both would be the worse trade: getPageVisibility() is cache()d per
-- render and reads the two in parallel, so the cost is one extra round trip per
-- render, and the mapping stays in one file.
create or replace view public.public_tenant_modules as
select
  m.key as module_key,
  coalesce(tm.enabled, pm.enabled, m.default_enabled) as enabled
from public.modules m
left join public.tenant_modules tm
  on tm.tenant_id = public.public_tenant_id()
 and tm.module_key = m.key
left join public.plan_modules pm
  on pm.plan = (select t.plan from public.tenants t where t.id = public.public_tenant_id())
 and pm.module_key = m.key;

comment on view public.public_tenant_modules is
  'Module entitlements for the tenant the request host resolves to (#902). The public-site counterpart to tenant_module_enabled(), which answers only for a signed-in member.';

grant select on public.public_tenant_modules to anon, authenticated;

-- The same answer for the tenant a signed-in admin has *selected*, which is not
-- always the one their host resolves to -- page-visibility.ts already carries
-- this split for the visibility flags themselves, and for the same reason: a
-- portal admin editing tenant A while sitting on a host that resolves to B
-- would otherwise see B's answer and be told a section is unavailable that is
-- perfectly available to them.
--
-- Reading `tenant_modules` directly would nearly work -- #900 gives a tenant a
-- select policy on its own rows -- but it would miss the plan and catalog
-- fallbacks underneath, so a tenant with no row of its own would come back with
-- nothing rather than with what it actually has.
create or replace function public.my_modules()
returns table (module_key text, label text, enabled boolean, is_core boolean)
language sql
security definer
set search_path = public
stable
as $$
  select
    m.key,
    m.label,
    public.module_enabled_for_tenant((select public.current_tenant_id()), m.key),
    m.is_core
  from public.modules m
  order by m.sort_order, m.key;
$$;

comment on function public.my_modules() is
  'The module entitlements of the tenant the caller is looking at (#902), resolved the same way tenant_module_enabled() does. For the administration screens that have to explain why a control is unavailable.';

grant execute on function public.my_modules() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. The public write paths
-- ---------------------------------------------------------------------------

-- Every function below is unchanged except for one added check, placed after
-- the rate limit and the honeypot so neither behaviour moves: a filled honeypot
-- still gets its fake success, and an off module still costs an attacker a
-- rate-limit slot.
--
-- Each raises the code it *already* uses for "there is nothing here for you"
-- rather than a new one. That is deliberate. These codes are mapped to visitor
-- copy in each route's ERROR_MESSAGES, so reusing them means the form a visitor
-- somehow reached still says something true and human instead of falling
-- through to "something went wrong" -- and from the visitor's side "event not
-- found" is exactly right, because for this organization there are no events.
-- The cost is that an operator debugging a refusal sees EVENT_NOT_FOUND and has
-- to know to look here; the mapping below is the one place that says so:
--
--   register_for_event                  events          EVENT_NOT_FOUND
--   save_registrant_rider_profile       events          RIDER_PROFILE_UNAVAILABLE
--   request_gear_item                   inventory       ITEM_NOT_FOUND
--   request_gear_items                  inventory       ITEM_NOT_FOUND
--   submit_volunteer_application        volunteers      SECTION_UNAVAILABLE
--   lookup_volunteer_application_status volunteers      (null, as for a miss)
--   submit_contact_message              communications  SECTION_UNAVAILABLE
--   submit_artwork                      artwork         CALL_CLOSED
--   claim_artwork_upload_slots          artwork         CALL_CLOSED
--   get_artwork_call                    artwork         (no rows, as for a miss)
--
-- The two that answer with emptiness rather than an error keep doing that: they
-- are lookups, and their callers already render a not-found page for an empty
-- answer. Raising there would turn a quiet 404 into an error banner.
--
-- SECTION_UNAVAILABLE is new, for the two whose only existing "unavailable"
-- answer is the bare 'No tenant resolved for this request' -- a string written
-- for a misconfigured deployment, not for a visitor.
--
-- module_enabled_for_tenant(null, ...) returns true, so none of these checks
-- shadows the function's own `v_tenant_id is null` branch: an unresolved host
-- still gets the more specific answer it got before.

create or replace function public.register_for_event(
  p_event_id uuid,
  p_name text,
  p_email text,
  p_phone text,
  p_party_size integer,
  p_notes text,
  p_honeypot text default null,
  p_ip_address inet default null,
  p_instagram_handle text default null,
  p_pronouns text default null
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

  if p_party_size is null or p_party_size < 1 then
    raise exception 'INVALID_PARTY_SIZE';
  end if;

  if char_length(v_pronouns) > 40 then
    raise exception 'PRONOUNS_TOO_LONG';
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

  insert into public.event_registrations
    (tenant_id, event_id, name, email, phone, party_size, notes, person_id, instagram_handle, pronouns)
  values
    (v_tenant_id, p_event_id, p_name, p_email, p_phone, p_party_size, p_notes, v_person_id, p_instagram_handle, v_pronouns)
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

create or replace function public.save_registrant_rider_profile(
  p_registration_id uuid,
  p_riding_discipline text,
  p_ski_experience_level text default null,
  p_snowboard_experience_level text default null,
  p_preferred_mountain text default null,
  p_honeypot text default null,
  p_ip_address inet default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person_id uuid;
  v_tenant_id uuid := public.public_tenant_id();
begin
  if not public.check_rate_limit('save_registrant_rider_profile', p_ip_address, 8, interval '15 minutes') then
    raise exception 'RATE_LIMITED';
  end if;

  if p_honeypot is not null and p_honeypot <> '' then
    return;
  end if;

  -- #902
  if not public.module_enabled_for_tenant(v_tenant_id, 'events') then
    raise exception 'RIDER_PROFILE_UNAVAILABLE';
  end if;

  if p_riding_discipline is null or p_riding_discipline not in ('ski', 'snowboard', 'both') then
    raise exception 'INVALID_RIDER_PROFILE';
  end if;

  if p_riding_discipline in ('ski', 'both')
    and (p_ski_experience_level is null
      or p_ski_experience_level not in ('beginner', 'intermediate', 'advanced')) then
    raise exception 'INVALID_RIDER_PROFILE';
  end if;

  if p_riding_discipline in ('snowboard', 'both')
    and (p_snowboard_experience_level is null
      or p_snowboard_experience_level not in ('beginner', 'intermediate', 'advanced')) then
    raise exception 'INVALID_RIDER_PROFILE';
  end if;

  select person_id into v_person_id
  from public.event_registrations
  where id = p_registration_id
    and tenant_id = v_tenant_id
    and person_id is not null
    and created_at > now() - interval '1 day';

  if v_person_id is null then
    raise exception 'RIDER_PROFILE_UNAVAILABLE';
  end if;

  update public.people
  set riding_discipline = p_riding_discipline,
      ski_experience_level = case
        when p_riding_discipline in ('ski', 'both') then p_ski_experience_level
      end,
      snowboard_experience_level = case
        when p_riding_discipline in ('snowboard', 'both') then p_snowboard_experience_level
      end,
      preferred_mountain = nullif(btrim(coalesce(p_preferred_mountain, '')), '')
  where id = v_person_id
    and tenant_id = v_tenant_id;
end;
$$;

create or replace function public.request_gear_item(
  p_inventory_item_id uuid,
  p_name text,
  p_email text,
  p_phone text,
  p_notes text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_person_id uuid;
  v_movement_id uuid;
  v_notes text := nullif(btrim(p_notes), '');
  v_tenant_id uuid := public.public_tenant_id();
begin
  -- #902. First here rather than after a rate limit, because this is the one
  -- public intake with no rate limit of its own -- request_gear_items
  -- superseded it and carries one.
  if not public.module_enabled_for_tenant(v_tenant_id, 'inventory') then
    raise exception 'ITEM_NOT_FOUND';
  end if;

  select status into v_status
  from public.inventory_items
  where id = p_inventory_item_id
    and tenant_id = v_tenant_id
  for update;

  if not found then
    raise exception 'ITEM_NOT_FOUND';
  end if;

  if v_status <> 'available' then
    raise exception 'ITEM_ALREADY_REQUESTED';
  end if;

  v_person_id := public.resolve_or_create_person_by_email(
    p_name, p_email, p_phone, null, 'other', null, null, null, v_tenant_id
  );

  insert into public.inventory_movements
    (tenant_id, inventory_item_id, movement_type, quantity, reason, recipient_person_id, notes)
  values
    (v_tenant_id, p_inventory_item_id, 'reserved', 1, 'Public gear library request', v_person_id, v_notes)
  returning id into v_movement_id;

  update public.inventory_items set status = 'reserved'
   where id = p_inventory_item_id and tenant_id = v_tenant_id;

  return v_movement_id;
end;
$$;

create or replace function public.request_gear_items(
  p_inventory_item_ids uuid[],
  p_name text,
  p_email text,
  p_phone text,
  p_notes text default null,
  p_honeypot text default null,
  p_ip_address inet default null
) returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item_id uuid;
  v_status text;
  v_person_id uuid;
  v_movement_id uuid;
  v_movement_ids uuid[] := '{}';
  v_notes text := nullif(btrim(p_notes), '');
  v_tenant_id uuid := public.public_tenant_id();
begin
  if not public.check_rate_limit('request_gear_items', p_ip_address, 8, interval '15 minutes') then
    raise exception 'RATE_LIMITED';
  end if;

  if p_honeypot is not null and p_honeypot <> '' then
    return array[gen_random_uuid()];
  end if;

  -- #902
  if not public.module_enabled_for_tenant(v_tenant_id, 'inventory') then
    raise exception 'ITEM_NOT_FOUND';
  end if;

  if p_inventory_item_ids is null or array_length(p_inventory_item_ids, 1) is null then
    raise exception 'NO_ITEMS';
  end if;

  for v_item_id in select unnest(p_inventory_item_ids) order by 1
  loop
    select status into v_status
    from public.inventory_items
    where id = v_item_id
      and tenant_id = v_tenant_id
      and intended_use = 'gear_library'
    for update;

    if not found then
      raise exception 'ITEM_NOT_FOUND';
    end if;

    if v_status <> 'available' then
      raise exception 'ITEM_ALREADY_REQUESTED';
    end if;
  end loop;

  v_person_id := public.resolve_or_create_person_by_email(
    p_name, p_email, p_phone, null, 'other', null, null, null, v_tenant_id
  );

  foreach v_item_id in array p_inventory_item_ids
  loop
    insert into public.inventory_movements
      (tenant_id, inventory_item_id, movement_type, quantity, reason, recipient_person_id, notes)
    values
      (v_tenant_id, v_item_id, 'reserved', 1, 'Public gear library request', v_person_id, v_notes)
    returning id into v_movement_id;

    update public.inventory_items set status = 'reserved'
     where id = v_item_id and tenant_id = v_tenant_id;

    v_movement_ids := array_append(v_movement_ids, v_movement_id);
  end loop;

  return v_movement_ids;
end;
$$;

create or replace function public.submit_volunteer_application(
  p_name text,
  p_email text,
  p_phone text,
  p_role_interest text,
  p_availability text,
  p_honeypot text default null,
  p_ip_address inet default null,
  p_pronouns text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person_id uuid;
  v_reference_code text;
  v_recent_count integer;
  v_pronouns text := nullif(btrim(p_pronouns), '');
  v_tenant_id uuid := public.public_tenant_id();
begin
  if not public.check_rate_limit('submit_volunteer_application', p_ip_address, 5, interval '15 minutes') then
    raise exception 'RATE_LIMITED';
  end if;

  if p_honeypot is not null and p_honeypot <> '' then
    return public.generate_volunteer_reference_code(v_tenant_id);
  end if;

  -- #902
  if not public.module_enabled_for_tenant(v_tenant_id, 'volunteers') then
    raise exception 'SECTION_UNAVAILABLE';
  end if;

  if p_name is null or btrim(p_name) = '' then
    raise exception 'NAME_REQUIRED';
  end if;
  if p_email is null or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'INVALID_EMAIL';
  end if;
  if char_length(v_pronouns) > 40 then
    raise exception 'PRONOUNS_TOO_LONG';
  end if;
  if v_tenant_id is null then
    raise exception 'No tenant resolved for this request';
  end if;

  select count(*) into v_recent_count
  from public.volunteer_applications
  where lower(email) = lower(p_email)
    and tenant_id = v_tenant_id
    and created_at > now() - interval '1 day';

  if v_recent_count > 0 then
    raise exception 'ALREADY_SUBMITTED';
  end if;

  v_person_id := public.resolve_or_create_person_by_email(
    p_name, p_email, p_phone, null, 'other', 'is_volunteer', null, v_pronouns, v_tenant_id
  );

  v_reference_code := public.generate_volunteer_reference_code(v_tenant_id);

  insert into public.volunteer_applications
    (tenant_id, person_id, name, email, phone, role_interest, availability, reference_code, pronouns)
  values
    (v_tenant_id, v_person_id, p_name, p_email, p_phone, p_role_interest, p_availability, v_reference_code, v_pronouns);

  return v_reference_code;
end;
$$;

create or replace function public.lookup_volunteer_application_status(
  p_email text,
  p_reference_code text,
  p_ip_address inet default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_tenant_id uuid := public.public_tenant_id();
begin
  if not public.check_rate_limit('lookup_volunteer_application_status', p_ip_address, 10, interval '15 minutes') then
    raise exception 'RATE_LIMITED';
  end if;

  -- #902. A lookup, so an off module answers the way a miss does -- the caller
  -- renders "we could not find that reference", which is true.
  if p_email is not null and p_reference_code is not null
     and public.module_enabled_for_tenant(v_tenant_id, 'volunteers') then
    select status into v_status
    from public.volunteer_applications
    where lower(email) = lower(p_email)
      and reference_code = upper(btrim(p_reference_code))
      and tenant_id = v_tenant_id;
  end if;

  -- No exception on a miss, so the rate_limit_hits row above commits; see
  -- 20260906050000.
  return v_status;
end;
$$;

create or replace function public.submit_contact_message(
  p_name text,
  p_email text,
  p_topic text,
  p_message text,
  p_honeypot text default null,
  p_ip_address inet default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_message_id uuid;
  v_tenant_id uuid := public.public_tenant_id();
begin
  if not public.check_rate_limit('submit_contact_message', p_ip_address, 5, interval '15 minutes') then
    raise exception 'RATE_LIMITED';
  end if;

  if p_honeypot is not null and p_honeypot <> '' then
    return gen_random_uuid();
  end if;

  -- #902
  if not public.module_enabled_for_tenant(v_tenant_id, 'communications') then
    raise exception 'SECTION_UNAVAILABLE';
  end if;

  if p_name is null or btrim(p_name) = '' then
    raise exception 'NAME_REQUIRED';
  end if;
  if p_email is null or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'INVALID_EMAIL';
  end if;
  if p_topic is null or btrim(p_topic) = '' then
    raise exception 'TOPIC_REQUIRED';
  end if;
  if p_message is null or btrim(p_message) = '' then
    raise exception 'MESSAGE_REQUIRED';
  end if;
  if v_tenant_id is null then
    raise exception 'No tenant resolved for this request';
  end if;

  insert into public.contact_messages (tenant_id, name, email, topic, message)
  values (v_tenant_id, p_name, p_email, p_topic, p_message)
  returning id into v_message_id;

  return v_message_id;
end;
$$;

create or replace function public.get_artwork_call(
  p_code text,
  p_ip_address inet default null
) returns table (
  call_id uuid,
  title text,
  event_id uuid,
  event_name text,
  starts_at timestamptz,
  display_timezone text,
  location text,
  intro text,
  rights_note text,
  closes_at timestamptz,
  max_images integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := public.public_tenant_id();
begin
  -- 30, not the 5 an intake form gets: this fires on every render of the page,
  -- including the reload a submitter does after a failed upload.
  if not public.check_rate_limit('get_artwork_call', p_ip_address, 30, interval '15 minutes') then
    raise exception 'RATE_LIMITED';
  end if;

  if v_tenant_id is null then
    return;
  end if;

  -- #902. A lookup, so an off module answers with no rows, the way an unknown
  -- code does -- the page renders its own "this call is closed".
  if not public.module_enabled_for_tenant(v_tenant_id, 'artwork') then
    return;
  end if;

  return query
  select c.id, c.title, c.event_id, e.name, e.starts_at,
         coalesce(c.timezone, e.timezone, 'UTC'), e.location,
         c.intro, c.rights_note, c.closes_at, c.max_images
    from public.event_artwork_calls c
    left join public.events e
      on e.id = c.event_id and e.tenant_id = c.tenant_id
   where c.tenant_id = v_tenant_id
     and c.submission_code = upper(btrim(coalesce(p_code, '')))
     and c.is_open
     and (c.opens_at is null or c.opens_at <= now())
     and (c.closes_at is null or c.closes_at >= now());
end;
$$;

create or replace function public.claim_artwork_upload_slots(
  p_code text,
  p_count integer,
  p_ip_address inet default null
) returns table (tenant_id uuid, call_id uuid, max_images integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := public.public_tenant_id();
  v_call public.event_artwork_calls;
begin
  -- The tightest limit in this feature, because this is the one call that
  -- creates writable capacity in a paid-by-the-gigabyte bucket. Twenty slots
  -- per quarter hour is six full submissions.
  if not public.check_rate_limit('claim_artwork_upload_slots', p_ip_address, 20, interval '15 minutes') then
    raise exception 'RATE_LIMITED';
  end if;

  if v_tenant_id is null then
    raise exception 'CALL_CLOSED';
  end if;

  -- #902
  if not public.module_enabled_for_tenant(v_tenant_id, 'artwork') then
    raise exception 'CALL_CLOSED';
  end if;

  select c.* into v_call
    from public.event_artwork_calls c
   where c.tenant_id = v_tenant_id
     and c.submission_code = upper(btrim(coalesce(p_code, '')))
     and c.is_open
     and (c.opens_at is null or c.opens_at <= now())
     and (c.closes_at is null or c.closes_at >= now());

  if v_call.id is null then
    raise exception 'CALL_CLOSED';
  end if;

  if coalesce(p_count, 0) < 1 or p_count > v_call.max_images then
    raise exception 'TOO_MANY_IMAGES';
  end if;

  return query select v_call.tenant_id, v_call.id, v_call.max_images;
end;
$$;

create or replace function public.submit_artwork(
  p_code text,
  p_name text,
  p_email text,
  p_title text,
  p_medium text,
  p_statement text,
  p_images jsonb,
  p_credit_name text default null,
  p_portfolio_url text default null,
  p_consent boolean default false,
  p_honeypot text default null,
  p_ip_address inet default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := public.public_tenant_id();
  v_call public.event_artwork_calls;
  v_submission_id uuid;
  v_image jsonb;
  v_position integer := 0;
  v_portfolio text := nullif(btrim(coalesce(p_portfolio_url, '')), '');
  -- Built from the resolved ids rather than from a wildcard, so a path can
  -- only ever name an object inside this tenant's folder for this call.
  v_uuid text := '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
  v_prefix text;
begin
  if not public.check_rate_limit('submit_artwork', p_ip_address, 5, interval '15 minutes') then
    raise exception 'RATE_LIMITED';
  end if;

  -- A filled honeypot gets an id for a row that was never written, so a bot
  -- sees the same success a person does and has nothing to tune against.
  if p_honeypot is not null and p_honeypot <> '' then
    return gen_random_uuid();
  end if;

  -- #902
  if not public.module_enabled_for_tenant(v_tenant_id, 'artwork') then
    raise exception 'CALL_CLOSED';
  end if;

  if p_name is null or btrim(p_name) = '' then
    raise exception 'NAME_REQUIRED';
  end if;
  if p_email is null or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'INVALID_EMAIL';
  end if;
  if p_consent is not true then
    raise exception 'CONSENT_REQUIRED';
  end if;
  if v_portfolio is not null and v_portfolio ~ '://' and v_portfolio !~* '^https?://' then
    raise exception 'INVALID_PORTFOLIO_URL';
  end if;

  if v_tenant_id is null then
    raise exception 'CALL_CLOSED';
  end if;

  select c.* into v_call
    from public.event_artwork_calls c
   where c.tenant_id = v_tenant_id
     and c.submission_code = upper(btrim(coalesce(p_code, '')))
     and c.is_open
     and (c.opens_at is null or c.opens_at <= now())
     and (c.closes_at is null or c.closes_at >= now());

  if v_call.id is null then
    raise exception 'CALL_CLOSED';
  end if;

  if p_images is null or jsonb_typeof(p_images) <> 'array' or jsonb_array_length(p_images) = 0 then
    raise exception 'IMAGES_REQUIRED';
  end if;
  if jsonb_array_length(p_images) > v_call.max_images then
    raise exception 'TOO_MANY_IMAGES';
  end if;

  insert into public.artwork_submissions (
    tenant_id, call_id, event_id, submitter_name, submitter_email, title, medium,
    artist_statement, credit_name, portfolio_url, consented_at
  )
  values (
    v_tenant_id,
    v_call.id,
    v_call.event_id,
    btrim(p_name),
    lower(btrim(p_email)),
    nullif(btrim(coalesce(p_title, '')), ''),
    nullif(btrim(coalesce(p_medium, '')), ''),
    nullif(btrim(coalesce(p_statement, '')), ''),
    -- Nested: the inner nullif turns an untouched field into null, the outer
    -- one turns "typed the same name again" into null too.
    nullif(nullif(btrim(coalesce(p_credit_name, '')), ''), btrim(p_name)),
    v_portfolio,
    now()
  )
  returning id into v_submission_id;

  -- The call id, or the event id for a draft whose files were uploaded under
  -- the old layout before this shipped. An artist part-way through a
  -- submission at deploy time should not have their upload refused; both
  -- segments are ids this server resolved, so the alternation widens nothing.
  v_prefix := '^' || v_tenant_id::text || '/('
    || v_call.id::text
    || coalesce('|' || v_call.event_id::text, '')
    || ')/' || v_uuid || '/' || v_uuid;

  for v_image in select * from jsonb_array_elements(p_images) loop
    if (v_image ->> 'path') !~ (v_prefix || '\.(jpg|jpeg|png|webp)$') then
      raise exception 'INVALID_IMAGE_PATH';
    end if;
    if (v_image ->> 'thumbPath') !~ (v_prefix || '-thumb\.jpg$') then
      raise exception 'INVALID_IMAGE_PATH';
    end if;
    if (v_image ->> 'contentType') not in ('image/jpeg', 'image/png', 'image/webp') then
      raise exception 'INVALID_IMAGE_PATH';
    end if;

    insert into public.artwork_submission_images (
      tenant_id, submission_id, storage_path, thumb_path, content_type, byte_size, position
    )
    values (
      v_tenant_id,
      v_submission_id,
      v_image ->> 'path',
      v_image ->> 'thumbPath',
      v_image ->> 'contentType',
      nullif(v_image ->> 'byteSize', '')::bigint,
      v_position
    );
    v_position := v_position + 1;
  end loop;

  return v_submission_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Isolation self-check (20260906100000)
-- ---------------------------------------------------------------------------

-- A new view and nine replaced functions, no new table and no new policy -- but
-- a migration that touches this many security definer functions is exactly the
-- kind where the assumption is worth verifying.
do $$
declare
  v_gaps text;
begin
  with tenant_tables as (
    select c.oid, c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attname = 'tenant_id' and not a.attisdropped
    where n.nspname = 'public' and c.relkind = 'r'
  ),
  gaps as (
    select 'policy ' || p.tablename || '."' || p.policyname || '"' as gap
    from pg_policies p
    join tenant_tables t on t.relname = p.tablename
    where p.schemaname = 'public'
      and coalesce(p.qual, '') !~ 'tenant_id'
      and coalesce(p.with_check, '') !~ 'tenant_id'
      and not (p.tablename = 'user_roles' and p.policyname = 'user views own roles')
    union all
    select 'fk ' || ch.relname || '.' || c.conname
    from pg_constraint c
    join tenant_tables ch on ch.oid = c.conrelid
    join tenant_tables pa on pa.oid = c.confrelid
    join pg_attribute fa on fa.attrelid = c.confrelid and fa.attnum = c.confkey[1]
    where c.contype = 'f'
      and array_length(c.conkey, 1) = 1
      and fa.attname = 'id'
  )
  select string_agg(gap, ', ') into v_gaps from gaps;

  if v_gaps is not null then
    raise exception 'Tenant isolation gaps remain: %', v_gaps;
  end if;
end $$;
