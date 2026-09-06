-- Multi-tenancy Phase 3 (#707): a request with no session resolves its tenant
-- from the host it was made to.
--
-- Everything anon-facing -- the eight public_* views, the intake RPCs
-- (register_for_event, submit_contact_message, submit_volunteer_application,
-- request_gear_item(s), save_registrant_rider_profile,
-- lookup_volunteer_application_status) and the first-login auto-join in
-- ensure_tenant_membership() -- runs with auth.uid() null, so
-- current_tenant_id() has nothing to say. Phase 2 (20260906000000) bridged
-- that with "the sole active tenant when exactly one exists", which is what
-- makes today's single-tenant database work and what makes a second tenant
-- fail closed. This migration adds the resolution that lets a second tenant
-- actually be served:
--
--   request_host()                  the host the app was asked for, carried
--                                   as an `x-tenant-host` request header that
--                                   src/lib/supabase/server.ts stamps on
--                                   every server-side Supabase call (PostgREST
--                                   exposes request headers as the
--                                   request.headers setting)
--   resolve_tenant_id_from_host(h)  the active tenant whose custom_domain is
--                                   that host or a parent of it, so
--                                   www.example.org and portal.example.org
--                                   both resolve to the tenant that owns
--                                   example.org; longest match wins
--   public_tenant_id()              the tenant a *public-site* request is
--                                   for: the host's tenant, else the sole
--                                   active tenant. Never the session's: an
--                                   admin of one tenant filling in another
--                                   tenant's contact form is talking to that
--                                   tenant, not their own
--   default_tenant_id()             unchanged in meaning -- the caller's
--                                   current tenant, else public_tenant_id()
--                                   -- so it now resolves through the host
--                                   before the sole-tenant fallback, and
--                                   column defaults keep working unchanged
--
-- The sole-active-tenant fallback stays, deliberately. It is what pg_cron,
-- supabase/seed.sql, migrations and service-role fixtures resolve through
-- (none of them has a host either), and on a multi-tenant database it is
-- null, so an unresolved request still fails closed on the not-null
-- constraint or the "No tenant resolved" check below.
--
-- Trusting a header: the header is set by our own server from the request
-- Host, and even a forged one can only pick which tenant's *public* surface
-- the caller is talking to -- exactly what visiting that tenant's site does.
-- Nothing session-scoped consults it: has_permission() and every policy
-- predicate use current_tenant_id(), which is membership-checked.
--
-- The intake RPCs are rewritten to look their target rows up inside the
-- resolved tenant and to name the tenant on insert, rather than relying on
-- the column default alone: an event id from another tenant must read as
-- "no such event", not as a registration that lands wherever the default
-- says. Bodies are otherwise those of 20260905070000 / 20260906050000 /
-- 20260904130000 / 20260905160000.

-- Resolution -----------------------------------------------------------------

create or replace function public.request_host()
returns text
language sql
stable
set search_path = public
as $$
  select nullif(
    lower(regexp_replace(
      btrim(coalesce(
        current_setting('request.headers', true)::json ->> 'x-tenant-host',
        ''
      )),
      -- strip a port, a trailing dot
      '(:[0-9]+)?\.?$', ''
    )),
    ''
  );
$$;

comment on function public.request_host() is
  'The x-tenant-host request header, normalised (lowercase, no port). Null outside a PostgREST request or when the app did not send one.';

create or replace function public.resolve_tenant_id_from_host(p_host text)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select t.id
  from public.tenants t
  where t.status = 'active'
    and t.custom_domain is not null
    and p_host is not null
    and (
      p_host = t.custom_domain
      or right(p_host, length(t.custom_domain) + 1) = '.' || t.custom_domain
    )
  order by length(t.custom_domain) desc
  limit 1;
$$;

comment on function public.resolve_tenant_id_from_host(text) is
  'The active tenant whose custom_domain equals the host or is a parent domain of it. Longest match wins; null when nothing matches.';

create or replace function public.public_tenant_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    public.resolve_tenant_id_from_host(public.request_host()),
    (select t.id
       from public.tenants t
      where t.status = 'active'
        and (select count(*) from public.tenants where status = 'active') = 1)
  );
$$;

comment on function public.public_tenant_id() is
  'Tenant a public-site (sessionless) request is for: resolved from the request host, else the sole active tenant, else null. Used by the public_* views and the anon intake RPCs.';

create or replace function public.default_tenant_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(public.current_tenant_id(), public.public_tenant_id());
$$;

comment on function public.default_tenant_id() is
  'Tenant for a new row: the caller''s current tenant, else the tenant resolved from the request host, else the sole active tenant, else null. Column default for tenant_id.';

grant execute on function public.request_host() to anon, authenticated, service_role;
grant execute on function public.resolve_tenant_id_from_host(text) to anon, authenticated, service_role;
grant execute on function public.public_tenant_id() to anon, authenticated, service_role;

-- First-login auto-join follows the host. The guards from 20260905180000
-- stand: never for an account that already has any membership (even a
-- suspended or expired one), and never when nothing resolves.
create or replace function public.ensure_tenant_membership()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
begin
  if auth.uid() is null then
    return null;
  end if;

  v_tenant_id := public.current_tenant_id();
  if v_tenant_id is not null then
    return v_tenant_id;
  end if;

  if exists (
    select 1 from public.tenant_memberships tm where tm.user_id = auth.uid()
  ) then
    return null;
  end if;

  v_tenant_id := public.public_tenant_id();
  if v_tenant_id is null then
    return null;
  end if;

  insert into public.tenant_memberships (user_id, tenant_id, kind, created_by)
  values (auth.uid(), v_tenant_id, 'member', auth.uid())
  on conflict (user_id, tenant_id) do nothing;

  return v_tenant_id;
end;
$$;

-- Views ----------------------------------------------------------------------
-- Same column lists as 20260906040000, so grants carry over. The one change
-- is default_tenant_id() -> public_tenant_id(): the public site answers for
-- the host, not for whoever happens to be signed in.

create or replace view public.public_page_visibility as
select substring(key from length('page_visibility.') + 1) as slot, value
from public.app_settings
where key like 'page_visibility.%'
  and tenant_id = public.public_tenant_id();

create or replace view public.public_site_images as
select substring(key from length('site_images.') + 1) as slot, value
from public.app_settings
where key like 'site_images.%'
  and tenant_id = public.public_tenant_id();

create or replace view public.public_events as
select
  id, name, location, starts_at, ends_at, timezone, description, capacity,
  registration_enabled, registration_deadline, flier_url
from public.events
where visibility = 'public'
  and status = 'published'
  and tenant_id = public.public_tenant_id();

create or replace view public.public_calendar_items as
select
  ci.id,
  ci.title,
  ci.item_type,
  ci.starts_at,
  ci.ends_at,
  ci.time_zone,
  ci.summary,
  (select array_agg(c.category) from public.calendar_item_categories c where c.item_id = ci.id) as categories,
  ci.public_url
from public.calendar_items ci
where ci.visibility = 'public'
  and ci.calendar_status in ('active', 'complete')
  and ci.tenant_id = public.public_tenant_id()
union all
select
  e.id,
  e.name as title,
  'chatter_event' as item_type,
  e.starts_at,
  e.ends_at,
  e.timezone as time_zone,
  e.description as summary,
  array['chatter_events'] as categories,
  '/events/' || e.id::text as public_url
from public.events e
where e.visibility = 'public'
  and e.status = 'published'
  and e.tenant_id = public.public_tenant_id();

create or replace view public.public_event_programs as
select ep.event_id, p.id as program_id, p.name
from public.event_programs ep
join public.programs p on p.id = ep.program_id
join public.events e on e.id = ep.event_id
where e.visibility = 'public'
  and e.status = 'published'
  and e.tenant_id = public.public_tenant_id();

create or replace view public.public_event_sponsors as
select es.id as sponsor_id, es.event_id, p.name, p.logo_url, p.website
from public.event_sponsors es
join public.people p on p.id = es.person_id
join public.events e on e.id = es.event_id
where es.is_public = true
  and e.visibility = 'public'
  and e.status = 'published'
  and e.tenant_id = public.public_tenant_id();

create or replace view public.public_gear_catalog as
select
  ii.id, ii.description, ii.size, ii.type, ii.gender, ii.condition, ii.photo_url, ii.created_at,
  c.key as category_key,
  c.label as category_label,
  g.key as category_group_key,
  g.label as category_group_label,
  c.sort_order as category_sort_order,
  g.sort_order as category_group_sort_order
from public.inventory_items ii
left join public.inventory_categories c on c.id = ii.category_id
left join public.inventory_category_groups g on g.id = c.group_id
where ii.status = 'available'
  and ii.intended_use = 'gear_library'
  and ii.tenant_id = public.public_tenant_id();

create or replace view public.public_volunteer_role_types as
select id, name, description
from public.volunteer_role_types
where is_public = true
  and tenant_id = public.public_tenant_id();

-- Anon intake ----------------------------------------------------------------
-- Each resolves the tenant once, up front, looks its inputs up inside it and
-- names it on every insert. resolve_or_create_person_by_email() takes the
-- tenant as an argument now so the person lands in the same tenant as the
-- row that references them; its default keeps the signed-in donation intake
-- (create_donation_with_items) unchanged.

drop function public.resolve_or_create_person_by_email(text, text, text, text, text, text, text, text);

create or replace function public.resolve_or_create_person_by_email(
  p_name text,
  p_email text,
  p_phone text default null,
  p_notes text default null,
  p_source_type text default 'other',
  p_role_flag text default null,
  p_instagram_handle text default null,
  p_pronouns text default null,
  p_tenant_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person_id uuid;
  v_pronouns text := nullif(btrim(p_pronouns), '');
  v_tenant_id uuid := coalesce(p_tenant_id, public.default_tenant_id());
begin
  if v_tenant_id is null then
    raise exception 'No tenant resolved for this request';
  end if;

  if p_email is not null and p_email <> '' then
    select id into v_person_id
    from public.people
    where lower(email) = lower(p_email)
      and tenant_id = v_tenant_id
      and not is_anonymous
    order by created_at asc
    limit 1;
  end if;

  if v_person_id is not null then
    if v_pronouns is not null then
      update public.people
         set pronouns = v_pronouns
       where id = v_person_id
         and pronouns is null;
    end if;
    return v_person_id;
  end if;

  begin
    insert into public.people
      (tenant_id, name, is_anonymous, source_type, email, phone, notes, created_by, instagram_handle, pronouns)
    values (
      v_tenant_id, p_name, false, p_source_type, p_email, p_phone, p_notes, auth.uid(), p_instagram_handle, v_pronouns
    )
    returning id into v_person_id;
  exception when unique_violation then
    select id into v_person_id
      from public.people
     where lower(email) = lower(p_email)
       and tenant_id = v_tenant_id
       and not is_anonymous
     order by created_at asc
     limit 1;
  end;

  return v_person_id;
end;
$$;

revoke execute on function public.resolve_or_create_person_by_email(text, text, text, text, text, text, text, text, uuid) from public, anon, authenticated;

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
)
returns uuid
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
)
returns void
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

create or replace function public.submit_contact_message(
  p_name text,
  p_email text,
  p_topic text,
  p_message text,
  p_honeypot text default null,
  p_ip_address inet default null
)
returns uuid
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

-- A zero-argument overload left in place would make every
-- generate_volunteer_reference_code() call ambiguous.
drop function public.generate_volunteer_reference_code();

create or replace function public.generate_volunteer_reference_code(p_tenant_id uuid default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
  v_tenant_id uuid := coalesce(p_tenant_id, public.default_tenant_id());
begin
  loop
    select string_agg(substr(v_chars, (ceil(random() * length(v_chars)))::int, 1), '')
    into v_code
    from generate_series(1, 8);

    exit when not exists (
      select 1 from public.volunteer_applications
       where reference_code = v_code
         and tenant_id = v_tenant_id
    );
  end loop;
  return v_code;
end;
$$;

revoke execute on function public.generate_volunteer_reference_code(uuid) from public, anon, authenticated;

create or replace function public.submit_volunteer_application(
  p_name text,
  p_email text,
  p_phone text,
  p_role_interest text,
  p_availability text,
  p_honeypot text default null,
  p_ip_address inet default null,
  p_pronouns text default null
)
returns text
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
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if not public.check_rate_limit('lookup_volunteer_application_status', p_ip_address, 10, interval '15 minutes') then
    raise exception 'RATE_LIMITED';
  end if;

  if p_email is not null and p_reference_code is not null then
    select status into v_status
    from public.volunteer_applications
    where lower(email) = lower(p_email)
      and reference_code = upper(btrim(p_reference_code))
      and tenant_id = public.public_tenant_id();
  end if;

  -- No exception on a miss, so the rate_limit_hits row above commits; see
  -- 20260906050000.
  return v_status;
end;
$$;

create or replace function public.request_gear_item(
  p_inventory_item_id uuid,
  p_name text,
  p_email text,
  p_phone text,
  p_notes text default null
)
returns uuid
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
)
returns uuid[]
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
