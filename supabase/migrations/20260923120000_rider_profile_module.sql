-- #1408: the rider profile becomes a Chatter Snow add-on module.
--
-- The post-registration "Do you ski or ride?" step (#563, #564), the door-side
-- capture (#653), the "What you ride" fieldset on /my/details (#1164) and the
-- Impact "Beginner participants" figure were all shipped to every tenant with
-- the `events` module. The demo tenant, and any organization that is not about
-- snow, was asked about skis and offered Camelback. "Rider" is Chatter Snow's
-- word, not the platform's; the generic replacement is designed in #1409.
--
-- Four parts:
--
--   1. The module, off by default, and on for Chatter Snow only.
--   2. A resource for it, `rider_profiles`, which is what lets the portal's
--      existing choke points -- has_permission() and my_permissions() -- turn
--      every rider surface off with the module, and what gives an
--      administrator a row in the matrix for who sees the answers.
--   3. Every write path that takes a rider answer refuses (or, for a
--      constituent's own record, leaves the stored answer alone) when the
--      module is off.
--   4. The preferred-mountain list moves out of code into a per-tenant
--      setting, `rider_profile.preferred_mountains`, that staff edit in the
--      portal. Chatter Snow is seeded with the list it had in code.
--
-- What "off" means is #900's: hidden and frozen, never deleted. The columns on
-- `people` and the `*_at_event` snapshots on `event_registrations` stay, the
-- retention rules still reach them, and delete_rider_profile() still honours a
-- deletion request. Turning the module back on restores everything as it was.

-- ---------------------------------------------------------------------------
-- 1. The module
-- ---------------------------------------------------------------------------

-- The second module in the catalog to default to off, after
-- constituent_accounts. Every other module was already shipping to every
-- tenant when #900 wrote the catalog down; this one describes one customer's
-- sport, so a tenant has it only when somebody decides it should.
insert into public.modules (key, label, description, sort_order, default_enabled, is_core) values
  ('rider_profile', 'Rider Profile',
   'An optional question after event registration about how a person skis or snowboards, their experience level and preferred mountain, with the beginner figure it feeds.',
   15, false, false);

-- Seeded for all three plans so provision_tenant(), which reads this table,
-- keeps giving a new tenant a complete set of rows.
insert into public.plan_modules (plan, module_key, enabled)
select p.plan, 'rider_profile', false
from (values ('internal'), ('demo'), ('white_label')) as p(plan);

-- Chatter Snow keeps what it has. Scoped by slug, so on a database with no
-- such tenant -- local and CI, which bootstrap as `example-nonprofit` -- this
-- is a clean no-op (supabase/seed.sql turns it on for the local tenant).
insert into public.tenant_modules (tenant_id, module_key, enabled)
select t.id, 'rider_profile', true
from public.tenants t
where t.slug = 'chatter-snow'
on conflict (tenant_id, module_key) do nothing;

-- ---------------------------------------------------------------------------
-- 2. The resource
-- ---------------------------------------------------------------------------

-- Who may see a rider's answers was never one permission: the registrants
-- list showed them at events:manage, the person record at people:view, and
-- the beginner figure at event_impact:view. Those gates stay where they are.
-- `rider_profiles` sits beside them, so each screen asks for its own
-- permission *and* this one -- the module decides whether the second can pass
-- at all, and an administrator can take rider answers away from a role
-- without touching what else it does.
insert into public.resources (key, section, label, description, sort_order, module_key) values
  ('rider_profiles', 'Events', 'Rider profiles',
   'How a person skis or snowboards, their experience level and preferred mountain, and the mountain list',
   47, 'rider_profile');

-- Seeded from each role's existing grants so nothing anyone can see or do
-- changes on the way in: Manage where the role already managed events or
-- people (the two places a rider answer could be edited), View where it could
-- see any screen that showed one, None otherwise. Every tenant's roles, not
-- only the template's -- roles are per tenant since Phase 2.
insert into public.role_permissions (role_id, resource_id, level)
select r.id, res.id,
  case
    when exists (
      select 1
        from public.role_permissions rp
        join public.resources x on x.id = rp.resource_id
       where rp.role_id = r.id
         and x.key in ('events', 'people')
         and rp.level = 'manage'
    ) then 'manage'
    when exists (
      select 1
        from public.role_permissions rp
        join public.resources x on x.id = rp.resource_id
       where rp.role_id = r.id
         and x.key in ('events', 'people', 'event_impact')
         and rp.level in ('view', 'manage')
    ) then 'view'
    else 'none'
  end
from public.roles r
cross join public.resources res
where res.key = 'rider_profiles';

-- ---------------------------------------------------------------------------
-- 3. Write paths
-- ---------------------------------------------------------------------------

-- The public post-registration step, and /api/v1/t/[tenant]/rider-profile,
-- which calls it. As defined in 20260911000000 with one check added.
-- SECTION_UNAVAILABLE is the answer #902 gave a module that is off where the
-- RPC had no "no such thing" of its own to reuse; the public API maps it to
-- 404 like every other disabled module.
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

  -- #1408
  if not public.module_enabled_for_tenant(v_tenant_id, 'rider_profile') then
    raise exception 'SECTION_UNAVAILABLE';
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

-- Door-side capture (#653). As defined in 20260906090000, with the rider
-- permission added to the events one. has_permission() answers false for a
-- resource whose module is off, so this is also the module gate.
create or replace function public.set_registrant_rider_profile(
  p_registration_id uuid,
  p_riding_discipline text,
  p_ski_experience_level text default null,
  p_snowboard_experience_level text default null,
  p_preferred_mountain text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person_id uuid;
  v_checked_in timestamptz;
  v_ski text;
  v_snowboard text;
begin
  if not public.has_permission('events', 'manage')
     or not public.has_permission('rider_profiles', 'manage') then
    raise exception 'Not authorized to edit registrant rider profiles';
  end if;

  if p_riding_discipline not in ('ski', 'snowboard', 'both') then
    raise exception 'INVALID_RIDER_PROFILE';
  end if;

  v_ski := case when p_riding_discipline in ('ski', 'both') then p_ski_experience_level end;
  v_snowboard := case when p_riding_discipline in ('snowboard', 'both') then p_snowboard_experience_level end;

  if p_riding_discipline in ('ski', 'both')
     and (v_ski is null or v_ski not in ('beginner', 'intermediate', 'advanced')) then
    raise exception 'INVALID_RIDER_PROFILE';
  end if;
  if p_riding_discipline in ('snowboard', 'both')
     and (v_snowboard is null or v_snowboard not in ('beginner', 'intermediate', 'advanced')) then
    raise exception 'INVALID_RIDER_PROFILE';
  end if;

  select person_id, checked_in_at into v_person_id, v_checked_in
  from public.event_registrations
  where id = p_registration_id
    and tenant_id = (select public.current_tenant_id());

  if v_person_id is null then
    raise exception 'REGISTRANT_NOT_FOUND';
  end if;

  update public.people
  set riding_discipline = p_riding_discipline,
      ski_experience_level = v_ski,
      snowboard_experience_level = v_snowboard,
      preferred_mountain = nullif(btrim(coalesce(p_preferred_mountain, '')), '')
  where id = v_person_id;

  if v_checked_in is not null then
    update public.event_registrations
    set riding_discipline_at_event = p_riding_discipline,
        ski_experience_level_at_event = v_ski,
        snowboard_experience_level_at_event = v_snowboard
    where id = p_registration_id;
  end if;
end;
$$;

-- A constituent's own record (#1164). As defined in 20260916080000, except
-- that with the module off the four rider arguments are ignored and the stored
-- answers are left exactly as they were. Not a refusal: the rest of the form
-- is the person's contact details, which have nothing to do with this module,
-- and /my/details simply does not render the rider fieldset. Not a clear
-- either: "off" is frozen, and a tenant that turns the module back on gets
-- back what its people told it.
create or replace function public.set_my_contact_details(
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
  v_rider boolean := public.public_module_enabled('rider_profile');
  v_discipline text := nullif(btrim(p_riding_discipline), '');
  v_ski text := nullif(btrim(p_ski_experience_level), '');
  v_snowboard text := nullif(btrim(p_snowboard_experience_level), '');
  v_handle text := nullif(btrim(ltrim(btrim(p_instagram_handle), '@')), '');
begin
  v_person_id := public.my_contact_person_id();
  if v_person_id is null then
    raise exception 'No record to edit';
  end if;

  if v_rider then
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
    preferred_mountain = case
      when v_rider then nullif(btrim(p_preferred_mountain), '')
      else preferred_mountain
    end,
    riding_discipline = case when v_rider then v_discipline else riding_discipline end,
    ski_experience_level = case when v_rider then v_ski else ski_experience_level end,
    snowboard_experience_level = case
      when v_rider then v_snowboard
      else snowboard_experience_level
    end,
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

-- ---------------------------------------------------------------------------
-- 4. The mountain list
-- ---------------------------------------------------------------------------

-- `rider_profile.preferred_mountains` in app_settings: a JSON array of names,
-- in the order the pickers offer them. "Other" is not stored -- both pickers
-- add it themselves and reveal a free-text box, and what lands in
-- people.preferred_mountain is whatever the person chose or typed, so the
-- column stays a plain text answer rather than a closed set. Editing the list
-- therefore never rewrites anybody's stored answer.

-- For the public post-registration step. One row when the host's tenant has
-- the module, none when it does not, so the page learns both things in one
-- read. `mountains` is an empty array for a tenant that has the module and has
-- listed nothing yet, which leaves "Other" as the only choice.
create view public.public_rider_profile_settings as
select coalesce(
         (select s.value
            from public.app_settings s
           where s.tenant_id = t.id
             and s.key = 'rider_profile.preferred_mountains'
             and jsonb_typeof(s.value) = 'array'),
         '[]'::jsonb
       ) as mountains
  from public.tenants t
 where t.id = public.public_tenant_id()
   -- Not module_enabled_for_tenant(): a view checks EXECUTE against the
   -- caller, and that one is service_role only. This is its anon-granted
   -- counterpart for the same host-resolved tenant.
   and public.public_module_enabled('rider_profile');

comment on view public.public_rider_profile_settings is
  'The resolved tenant''s preferred-mountain list for the public rider profile step (#1408), or no row when that tenant does not have the rider_profile module. Security definer by design (#887): app_settings has no anon policy. Isolation is t.id = public_tenant_id(), and the setting is read for that tenant only.';

alter view public.public_rider_profile_settings set (security_barrier = true);

grant select on public.public_rider_profile_settings to anon, authenticated;

-- For the portal: the door dialog's picker and the list editor. rider_profiles
-- at View, not the app_settings select policy's six `manage` permissions --
-- the audience is whoever sees rider answers.
create function public.rider_profile_mountains()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select case
    when public.has_permission('rider_profiles', 'view') then coalesce(
      (select s.value
         from public.app_settings s
        where s.tenant_id = (select public.current_tenant_id())
          and s.key = 'rider_profile.preferred_mountains'
          and jsonb_typeof(s.value) = 'array'),
      '[]'::jsonb
    )
  end;
$$;

comment on function public.rider_profile_mountains() is
  'The current tenant''s preferred-mountain list (#1408), or null when the caller may not see rider profiles -- which includes every caller on a tenant without the rider_profile module. Security definer by design (#887): app_settings'' select policy requires one of six manage permissions. Isolation is tenant_id = current_tenant_id().';

revoke execute on function public.rider_profile_mountains() from public, anon;
grant execute on function public.rider_profile_mountains() to authenticated;

-- The one write path. Gated on rider_profiles:manage rather than
-- system_settings:manage, because the list lives with the feature
-- (docs/portal-navigation.md), the same call set_gear_request_settings()
-- made. Names are trimmed and must be distinct ignoring case; "Other" is
-- refused because the pickers already offer it as the way to type a name in.
create function public.set_rider_profile_mountains(p_mountains text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_clean text[] := '{}';
  v_name text;
begin
  if not public.has_permission('rider_profiles', 'manage') or v_tenant_id is null then
    raise exception 'PERMISSION_DENIED';
  end if;

  if coalesce(array_length(p_mountains, 1), 0) > 50 then
    raise exception 'TOO_MANY_MOUNTAINS';
  end if;

  foreach v_name in array coalesce(p_mountains, '{}')
  loop
    v_name := btrim(coalesce(v_name, ''));
    if v_name = '' then
      raise exception 'MOUNTAIN_NAME_REQUIRED';
    end if;
    if length(v_name) > 80 then
      raise exception 'MOUNTAIN_NAME_TOO_LONG';
    end if;
    if lower(v_name) = 'other' then
      raise exception 'MOUNTAIN_NAME_RESERVED';
    end if;
    if lower(v_name) = any (select lower(c) from unnest(v_clean) c) then
      raise exception 'MOUNTAIN_NAME_DUPLICATE';
    end if;
    v_clean := array_append(v_clean, v_name);
  end loop;

  insert into public.app_settings (tenant_id, key, value, updated_by)
  values (v_tenant_id, 'rider_profile.preferred_mountains', to_jsonb(v_clean), auth.uid())
  on conflict (tenant_id, key) do update
    set value = excluded.value,
        updated_by = excluded.updated_by,
        updated_at = now();
end;
$$;

comment on function public.set_rider_profile_mountains(text[]) is
  'Replaces the current tenant''s preferred-mountain list (#1408). Gated on rider_profiles:manage, so it also refuses on a tenant without the rider_profile module.';

revoke execute on function public.set_rider_profile_mountains(text[]) from public, anon;
grant execute on function public.set_rider_profile_mountains(text[]) to authenticated;

-- Chatter Snow's list, as it was in src/lib/rider-profile.ts. Same shape as
-- 20260923110000: scoped by slug so it no-ops locally, a value the tenant has
-- already set wins, and the triggers are off so the write is not stamped with
-- a null actor or logged as a change somebody made.
alter table public.app_settings
  disable trigger set_updated_at,
  disable trigger audit_log_row;

insert into public.app_settings (tenant_id, key, value)
select t.id, 'rider_profile.preferred_mountains', jsonb_build_array(
  'Big Snow (American Dream)',
  'Mountain Creek',
  'Camelback',
  'Blue Mountain',
  'Shawnee',
  'Jack Frost / Big Boulder',
  'Hunter',
  'Windham',
  'Belleayre',
  'Mount Snow',
  'Stratton'
)
from public.tenants t
where t.slug = 'chatter-snow'
on conflict (tenant_id, key) do nothing;

alter table public.app_settings
  enable trigger set_updated_at,
  enable trigger audit_log_row;
