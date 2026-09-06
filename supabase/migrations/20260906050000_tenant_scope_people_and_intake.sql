-- Multi-tenancy Phase 2 (#707): the people directory, public intake and the
-- audit trigger look inside one tenant.
--
-- 20260906020000 made people.email and people.auth_user_id unique per tenant
-- rather than globally. Every function that looked a person up by either
-- column alone would now, on a multi-tenant database, find the first match in
-- whichever tenant sorted first -- plpgsql `select ... into` takes the first
-- row without complaint. Each is rewritten to look within a tenant:
--
-- - Signed-in paths (resolve_current_person_id, ensure_current_person,
--   link_person_to_auth_user, set_preferred_name_for_user, the duplicate and
--   merge RPCs) use current_tenant_id(), and treat null as "no such person".
--   set_my_preferred_name and set_my_pronouns delegate to
--   ensure_current_person() and need no change.
-- - Anon intake (resolve_or_create_person_by_email, the volunteer reference
--   code generator and status lookup) uses default_tenant_id() for the same
--   reason the views in 20260906040000 do: no session, so the sole active
--   tenant today and host resolution in Phase 3.
--
-- The merge RPCs are security definer and take ids, so an admin of tenant A
-- could otherwise pass tenant B's ids. Their person lookups are scoped to the
-- current tenant, so a foreign id reads as "No such person" -- no existence
-- leak, and merge_people() re-checks through person_merge_blockers() as
-- before.
--
-- resolve_inventory_category() gains a tenant argument: inventory_categories
-- is per-tenant now, and the trigger that calls it has the row's tenant to
-- hand. The old single-argument signature is dropped rather than overloaded
-- so there is exactly one resolver; the new argument defaults to
-- default_tenant_id() for the two migration-era backfills that already ran.
--
-- audit_log_row() stamps audit_log.tenant_id from the row it is auditing
-- (to_jsonb(NEW/OLD) ->> 'tenant_id'), never from the session: the trigger
-- fires under anon and cron sessions too, and the global tables simply have
-- no such key and log null.

-- People resolution (signed-in) ----------------------------------------------

create or replace function public.resolve_current_person_id()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person_id uuid;
  v_email text;
  v_tenant_id uuid := public.current_tenant_id();
begin
  if auth.uid() is null or v_tenant_id is null then
    return null;
  end if;

  select id into v_person_id
    from public.people
   where auth_user_id = auth.uid()
     and tenant_id = v_tenant_id;
  if v_person_id is not null then
    return v_person_id;
  end if;

  select email into v_email from auth.users where id = auth.uid();
  if v_email is null then
    return null;
  end if;

  select id into v_person_id
  from public.people
  where auth_user_id is null
    and tenant_id = v_tenant_id
    and lower(email) = lower(v_email)
  order by created_at asc
  limit 1;

  if v_person_id is not null then
    update public.people set auth_user_id = auth.uid() where id = v_person_id;
  end if;

  return v_person_id;
end;
$$;

create or replace function public.ensure_current_person()
returns table (person_id uuid, name text, preferred_name text, pronouns text, email text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person_id uuid;
  v_email text;
  v_tenant_id uuid := public.current_tenant_id();
begin
  -- No tenant yet (several memberships and no choice made, or none at all):
  -- nothing to create a person *in*. The portal layout shows the chooser or
  -- the no-tenant state instead of a directory record.
  if auth.uid() is null or v_tenant_id is null then
    return;
  end if;

  v_person_id := public.resolve_current_person_id();

  if v_person_id is null then
    begin
      insert into public.people (tenant_id, name, is_anonymous, source_type, email, auth_user_id, created_by)
      select
        v_tenant_id,
        coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', u.email),
        false,
        'other',
        u.email,
        u.id,
        u.id
      from auth.users u
      where u.id = auth.uid()
      returning id into v_person_id;
    exception when unique_violation then
      -- people_auth_user_id_key: a concurrent login won the race.
      select pp.id into v_person_id
        from public.people pp
       where pp.auth_user_id = auth.uid()
         and pp.tenant_id = v_tenant_id;

      if v_person_id is null then
        -- people_email_key: a directory record already holds this address.
        select u.email into v_email from auth.users u where u.id = auth.uid();

        select pp.id into v_person_id
          from public.people pp
         where lower(pp.email) = lower(v_email)
           and pp.tenant_id = v_tenant_id
           and not pp.is_anonymous
           and pp.auth_user_id is null
         order by pp.created_at asc
         limit 1;

        if v_person_id is not null then
          update public.people set auth_user_id = auth.uid() where id = v_person_id;
        else
          raise exception 'A directory record already uses this email address and is linked to a different portal account. An admin can merge the two records at People > Duplicates.';
        end if;
      end if;
    end;
  end if;

  return query
    select pp.id, pp.name, pp.preferred_name, pp.pronouns, pp.email
      from public.people pp
     where pp.id = v_person_id;
end;
$$;

create or replace function public.link_person_to_auth_user(p_person_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_person_id uuid;
  v_linked_user_id uuid;
  v_tenant_id uuid := public.current_tenant_id();
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'No such portal account';
  end if;

  select auth_user_id into v_linked_user_id
    from public.people
   where id = p_person_id
     and tenant_id = v_tenant_id;

  if not found then
    raise exception 'No such person';
  end if;

  -- Linking a person who already points at a different account would silently
  -- move the link; make it an error so the admin re-checks which record is
  -- the duplicate rather than losing the old association.
  if v_linked_user_id is not null and v_linked_user_id <> p_user_id then
    raise exception 'This person is already linked to a different portal account';
  end if;

  -- people_auth_user_id_key would reject this anyway; raise the readable
  -- error instead of surfacing a unique-violation to the UI.
  select id into v_existing_person_id
    from public.people
   where auth_user_id = p_user_id
     and tenant_id = v_tenant_id
     and id <> p_person_id;

  if v_existing_person_id is not null then
    raise exception 'That portal account is already linked to another person';
  end if;

  update public.people set auth_user_id = p_user_id where id = p_person_id;
end;
$$;

create or replace function public.set_preferred_name_for_user(p_user_id uuid, p_preferred_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person_id uuid;
  v_tenant_id uuid := public.current_tenant_id();
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  select id into v_person_id
    from public.people
   where auth_user_id = p_user_id
     and tenant_id = v_tenant_id;

  if v_person_id is null then
    select p.id into v_person_id
      from public.people p
      join auth.users u on lower(u.email) = lower(p.email)
     where p.auth_user_id is null
       and p.tenant_id = v_tenant_id
       and not p.is_anonymous
       and u.id = p_user_id
     order by p.created_at asc
     limit 1;

    if v_person_id is not null then
      update public.people set auth_user_id = p_user_id where id = v_person_id;
    else
      begin
        insert into public.people (tenant_id, name, is_anonymous, source_type, email, auth_user_id, created_by)
        select
          v_tenant_id,
          coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', u.email),
          false,
          'other',
          u.email,
          u.id,
          auth.uid()
        from auth.users u
        where u.id = p_user_id
        returning id into v_person_id;
      exception when unique_violation then
        raise exception 'A directory record already uses this account''s email address and is linked to someone else. Merge the two records at People > Duplicates first.';
      end;
    end if;
  end if;

  if v_person_id is null then
    raise exception 'No such user';
  end if;

  update public.people
     set preferred_name = nullif(trim(p_preferred_name), '')
   where id = v_person_id;
end;
$$;

-- Public intake (anon) -------------------------------------------------------

create or replace function public.resolve_or_create_person_by_email(
  p_name text,
  p_email text,
  p_phone text default null,
  p_notes text default null,
  p_source_type text default 'other',
  p_role_flag text default null,
  p_instagram_handle text default null,
  p_pronouns text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person_id uuid;
  v_pronouns text := nullif(btrim(p_pronouns), '');
  v_tenant_id uuid := public.default_tenant_id();
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

create or replace function public.generate_volunteer_reference_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
  v_tenant_id uuid := public.default_tenant_id();
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
  -- Same per-IP throttle style as submit_volunteer_application, so guessing
  -- reference codes for a known email can't be brute-forced.
  if not public.check_rate_limit('lookup_volunteer_application_status', p_ip_address, 10, interval '15 minutes') then
    raise exception 'RATE_LIMITED';
  end if;

  if p_email is not null and p_reference_code is not null then
    select status into v_status
    from public.volunteer_applications
    where lower(email) = lower(p_email)
      and reference_code = upper(btrim(p_reference_code))
      and tenant_id = public.default_tenant_id();
  end if;

  -- No exception on a miss: an unhandled exception aborts and rolls back
  -- the whole call, which would also undo the rate_limit_hits row the
  -- check above just committed toward -- silently letting every wrong
  -- guess (the exact enumeration attempt this throttle exists to catch)
  -- go uncounted. Returning null instead lets the transaction commit; the
  -- caller treats a null result as "not found".
  return v_status;
end;
$$;

-- Duplicates and merges -----------------------------------------------------

create or replace function public.find_duplicate_people()
returns table (
  email_key text, id uuid, name text, preferred_name text, person_type text,
  email text, auth_user_id uuid, created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission('people', 'manage') then
    raise exception 'Not authorized';
  end if;

  return query
    select lower(p.email), p.id, p.name, p.preferred_name, p.person_type,
           p.email, p.auth_user_id, p.created_at
      from public.people p
     where p.email is not null
       and not p.is_anonymous
       and p.tenant_id = (select public.current_tenant_id())
       and exists (
         select 1 from public.people q
          where q.id <> p.id
            and q.tenant_id = p.tenant_id
            and not q.is_anonymous
            and lower(q.email) = lower(p.email)
       )
     order by lower(p.email), p.created_at;
end;
$$;

create or replace function public.person_merge_blockers(p_survivor_id uuid, p_duplicate_id uuid)
returns table (kind text, table_name text, detail text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_survivor public.people;
  v_duplicate public.people;
  v_tenant_id uuid := public.current_tenant_id();
begin
  if not public.has_permission('people', 'manage') then
    raise exception 'Not authorized';
  end if;

  select * into v_survivor from public.people where id = p_survivor_id and tenant_id = v_tenant_id;
  if not found then
    raise exception 'No such person';
  end if;

  select * into v_duplicate from public.people where id = p_duplicate_id and tenant_id = v_tenant_id;
  if not found then
    raise exception 'No such person';
  end if;

  if p_survivor_id = p_duplicate_id then
    raise exception 'A person cannot be merged into themselves';
  end if;

  -- Same stance as link_person_to_auth_user (20260903000000): two portal
  -- accounts is a question about which login is real, and guessing silently
  -- drops somebody's access.
  if v_survivor.auth_user_id is not null
     and v_duplicate.auth_user_id is not null
     and v_survivor.auth_user_id <> v_duplicate.auth_user_id then
    return query select
      'blocker'::text,
      'people'::text,
      'Both records are linked to different portal accounts. Unlink one from its person record before merging.'::text;
  end if;

  if v_survivor.person_type is distinct from v_duplicate.person_type then
    return query select
      'advisory'::text,
      'people'::text,
      'One record is an organization and the other an individual. If they only share an address, link them as an organization membership or primary contact instead of merging.'::text;
  end if;

  -- Tables where both people holding a row for the same event means two real
  -- records with their own payload -- a sponsorship's contribution_value and
  -- its synced monetary_donation_id (20260830180000), a registration's
  -- party_size / checked_in_at / discount code / frozen rider snapshot
  -- (20260904120000). Repointing collides, and dropping either side loses data,
  -- so a human has to reconcile them on the two records first.
  return query
    select 'blocker'::text, 'event_sponsors'::text,
           'Both records sponsor ' || e.name || '. Remove or reconcile one sponsorship first.'
      from public.event_sponsors a
      join public.event_sponsors b on b.event_id = a.event_id and b.person_id = p_duplicate_id
      join public.events e on e.id = a.event_id
     where a.person_id = p_survivor_id;

  return query
    select 'blocker'::text, 'event_registrations'::text,
           'Both records are registered for ' || e.name || '. Cancel or reconcile one registration first.'
      from public.event_registrations a
      join public.event_registrations b on b.event_id = a.event_id and b.person_id = p_duplicate_id
      join public.events e on e.id = a.event_id
     where a.person_id = p_survivor_id;

  return query
    select 'blocker'::text, 'event_volunteers'::text,
           'Both records are signed up to volunteer at ' || e.name || '. Remove one signup first.'
      from public.event_volunteers a
      join public.event_volunteers b on b.event_id = a.event_id and b.person_id = p_duplicate_id
      join public.events e on e.id = a.event_id
     where a.person_id = p_survivor_id;

  return query
    select 'blocker'::text, 'event_staff'::text,
           'Both records are staffing ' || e.name || '. Remove one assignment first.'
      from public.event_staff a
      join public.event_staff b on b.event_id = a.event_id and b.person_id = p_duplicate_id
      join public.events e on e.id = a.event_id
     where a.person_id = p_survivor_id;
end;
$$;

create or replace function public.person_merge_preview(p_survivor_id uuid, p_duplicate_id uuid)
returns table (table_name text, column_name text, survivor_count bigint, duplicate_count bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_survivor bigint;
  v_duplicate bigint;
  v_tenant_id uuid := public.current_tenant_id();
begin
  if not public.has_permission('people', 'manage') then
    raise exception 'Not authorized';
  end if;

  if not exists (select 1 from public.people where id = p_survivor_id and tenant_id = v_tenant_id)
     or not exists (select 1 from public.people where id = p_duplicate_id and tenant_id = v_tenant_id) then
    raise exception 'No such person';
  end if;

  for r in
    select c.conrelid::regclass::text as tbl, a.attname::text as col
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'f'
       and c.confrelid = 'public.people'::regclass
       and array_length(c.conkey, 1) = 1
     order by 1, 2
  loop
    execute format('select count(*) from %s where %I = $1', r.tbl, r.col)
      into v_survivor using p_survivor_id;
    execute format('select count(*) from %s where %I = $1', r.tbl, r.col)
      into v_duplicate using p_duplicate_id;

    if v_survivor > 0 or v_duplicate > 0 then
      table_name := r.tbl;
      column_name := r.col;
      survivor_count := v_survivor;
      duplicate_count := v_duplicate;
      return next;
    end if;
  end loop;
end;
$$;

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

  -- Pre-delete only where a duplicate row carries no payload of its own, so
  -- the generic repoint below cannot collide on it. person_role_tags is a bare
  -- (person, role) assertion; person_organizations is a bare membership. Every
  -- other table's collisions were rejected as blockers above rather than
  -- silently dropped.
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
  -- list would rot into a silently-skipped table. Same loop shape as
  -- 20260902010000_link_calendar_owners_to_people.sql. This also picks up
  -- people.primary_contact_person_id, which it must -- the final delete would
  -- fail on it otherwise.
  for r in
    select c.conrelid::regclass::text as tbl, a.attname::text as col
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'f'
       and c.confrelid = 'public.people'::regclass
       and array_length(c.conkey, 1) = 1
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
    phone = coalesce(v_o->>'phone', v_survivor.phone, v_duplicate.phone),
    instagram_handle = coalesce(v_o->>'instagram_handle', v_survivor.instagram_handle, v_duplicate.instagram_handle),
    pronouns = coalesce(v_o->>'pronouns', v_survivor.pronouns, v_duplicate.pronouns),
    notes = coalesce(v_o->>'notes', v_survivor.notes, v_duplicate.notes),
    logo_url = coalesce(v_o->>'logo_url', v_survivor.logo_url, v_duplicate.logo_url),
    website = coalesce(v_o->>'website', v_survivor.website, v_duplicate.website),
    person_type = coalesce(v_o->>'person_type', v_survivor.person_type),
    source_type = coalesce(v_o->>'source_type', v_survivor.source_type),
    preferred_mountain = coalesce(v_o->>'preferred_mountain', v_survivor.preferred_mountain, v_duplicate.preferred_mountain),
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

-- Inventory categories -------------------------------------------------------

drop function public.resolve_inventory_category(text);

create function public.resolve_inventory_category(
  p_text text,
  p_tenant_id uuid default public.default_tenant_id()
)
returns uuid
language sql
stable
set search_path = public
as $$
  with term as (
    select nullif(lower(btrim(coalesce(p_text, ''))), '') as value
  ),
  alias as (
    select * from (values
      ('snow board', 'snowboard'), ('board', 'snowboard'), ('snowboards', 'snowboard'),
      ('split board', 'splitboard'),
      ('ski', 'skis'), ('skies', 'skis'),
      ('ski poles', 'poles'), ('pole', 'poles'),
      ('binding', 'bindings'),
      -- Outerwear. 'puffer'/'puffy' and the hooded/sweater-styled variants of
      -- it are jackets, not mid layers -- they are the outer shell in practice.
      ('coat', 'jacket'), ('jackets', 'jacket'), ('winter jacket', 'jacket'),
      ('insulated jacket', 'jacket'), ('parka', 'jacket'),
      ('hooded jacket', 'jacket'), ('puffer', 'jacket'), ('puffy', 'jacket'),
      ('puffer jacket', 'jacket'), ('crew sweater puffer', 'jacket'),
      ('pant', 'pants'), ('snow pants', 'pants'), ('snowpants', 'pants'),
      ('ski pants', 'pants'), ('bib', 'pants'), ('bibs', 'pants'),
      ('snowbib', 'pants'), ('snowbibs', 'pants'), ('snow bib', 'pants'),
      ('snow bibs', 'pants'), ('overalls', 'pants'),
      ('snow suit', 'snowsuit'), ('one piece', 'snowsuit'),
      ('shell jacket', 'shell'),
      -- Layers. "thermal set", "thermal top" and "bottom thermal" are all the
      -- same garment family; the vocabulary does not split thermals by half.
      ('baselayer', 'base_layer'), ('long johns', 'base_layer'),
      ('long underwear', 'base_layer'), ('long sleeve tee', 'base_layer'),
      ('long sleeve shirt', 'base_layer'),
      ('fleece', 'mid_layer'), ('pullover', 'mid_layer'), ('midlayer', 'mid_layer'),
      ('mid layer', 'mid_layer'), ('sweater', 'mid_layer'),
      ('hoodie', 'mid_layer'), ('hoody', 'mid_layer'), ('sweatshirt', 'mid_layer'),
      ('crew sweater', 'mid_layer'), ('crewneck', 'mid_layer'),
      ('thermal', 'thermals'), ('thermal top', 'thermals'),
      ('thermal bottom', 'thermals'), ('bottom thermal', 'thermals'),
      ('top thermal', 'thermals'), ('thermal set', 'thermals'),
      ('thermal bottoms', 'thermals'), ('thermal tops', 'thermals'),
      ('boot', 'boots'), ('snowboots', 'boots'), ('snow boots', 'boots'),
      ('winter boots', 'boots'), ('snowboard boots', 'boots'),
      ('snowboard boot', 'boots'), ('ski boots', 'boots'), ('ski boot', 'boots'),
      ('helmets', 'helmet'),
      ('pack', 'backpack'), ('daypack', 'backpack'), ('bag', 'backpack'),
      ('gift card', 'voucher'), ('giftcard', 'voucher'), ('vouchers', 'voucher'),
      ('lift pass', 'lift_ticket'), ('day pass', 'lift_ticket'),
      ('rentals', 'rental'),
      ('wrist guard', 'wrist_guards'),
      ('pad', 'pads'), ('knee pads', 'pads'),
      ('beanies', 'beanie'), ('hat', 'beanie'), ('toque', 'beanie'),
      ('glove', 'gloves'), ('mitten', 'gloves'), ('mittens', 'gloves'),
      ('mitts', 'gloves'),
      ('goggle', 'goggles'),
      ('gaiter', 'neck_gaiter'), ('neck warmer', 'neck_gaiter'),
      ('buff', 'neck_gaiter'), ('scarf', 'neck_gaiter'),
      ('balaclava', 'neck_gaiter'),
      ('sock', 'socks'),
      ('accessory', 'other'), ('accessories', 'other'), ('misc', 'other'),
      ('gear', 'other')
    ) as a(term, category_key)
  )
  select c.id
  from public.inventory_categories c
  where c.is_active
    and c.tenant_id = p_tenant_id
    and (
      c.key = (select value from term)
      or lower(c.label) = (select value from term)
      or c.key = (
        select a.category_key from alias a where a.term = (select value from term)
      )
    )
  limit 1;
$$;

revoke all on function public.resolve_inventory_category(text, uuid) from public;
grant execute on function public.resolve_inventory_category(text, uuid) to authenticated;

create or replace function public.set_inventory_item_category()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.category_id is null then
    new.category_id := public.resolve_inventory_category(new.type, new.tenant_id);
  end if;
  return new;
end;
$$;

-- Body from 20260904150000 with the explicit category lookup scoped to the
-- caller's tenant; the free-text fallback goes through the resolver above.
create or replace function public.create_donation_with_items(
  p_donor_name text,
  p_donor_is_anonymous boolean,
  p_donor_source_type text,
  p_donor_email text,
  p_donor_phone text,
  p_donor_notes text,
  p_items jsonb,
  p_event_id uuid default null
)
returns table (donation_id uuid, inventory_item_ids uuid[], giveaway_id uuid, untiered_item_ids uuid[])
language plpgsql
security definer
set search_path = public
as $$
declare
  v_donor_id uuid;
  v_donation_id uuid;
  v_item_id uuid;
  v_item jsonb;
  v_item_ids uuid[] := '{}';
  v_giveaway_id uuid;
  v_tier_id uuid;
  v_tier_key text;
  v_untiered uuid[] := '{}';
  v_category_id uuid;
  v_tier_text text;
  v_tenant_id uuid := public.current_tenant_id();
begin
  if not (public.has_permission('finance', 'manage') or public.has_permission('inventory_intake', 'manage')) then
    raise exception 'Not authorized to record a donation';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 then
    raise exception 'At least one item is required';
  end if;

  if p_donor_is_anonymous or p_donor_email is null or p_donor_email = '' then
    insert into public.people (name, is_anonymous, source_type, email, phone, notes)
    values (p_donor_name, p_donor_is_anonymous, p_donor_source_type, p_donor_email, p_donor_phone, p_donor_notes)
    returning id into v_donor_id;
  else
    v_donor_id := public.resolve_or_create_person_by_email(
      p_donor_name, p_donor_email, p_donor_phone, p_donor_notes, p_donor_source_type, null
    );
  end if;

  insert into public.donations (donor_id, event_id)
  values (v_donor_id, p_event_id)
  returning id into v_donation_id;

  -- Only a giveaway that has actually been set up with tiers grants tickets.
  -- A legacy flat giveaway (no tier rows) is left alone.
  if p_event_id is not null then
    select g.id into v_giveaway_id
    from public.giveaways g
    where g.event_id = p_event_id
      and exists (select 1 from public.giveaway_tiers t where t.giveaway_id = g.id);
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    -- An explicit category wins; otherwise fall back to reading the free text,
    -- so a caller that has not been updated yet still lands somewhere sensible.
    v_category_id := null;
    if nullif(v_item->>'category_key', '') is not null then
      select c.id into v_category_id
      from public.inventory_categories c
      where c.key = v_item->>'category_key'
        and c.tenant_id = v_tenant_id;
    end if;
    if v_category_id is null then
      v_category_id := public.resolve_inventory_category(v_item->>'type', v_tenant_id);
    end if;

    insert into public.inventory_items
      (donation_id, description, size, type, gender, condition, face_value, notes, intended_use, category_id)
    values (
      v_donation_id,
      v_item->>'description',
      v_item->>'size',
      v_item->>'type',
      v_item->>'gender',
      v_item->>'condition',
      nullif(v_item->>'face_value', '')::numeric,
      v_item->>'notes',
      coalesce(nullif(v_item->>'intended_use', ''), 'gear_library'),
      v_category_id
    )
    returning id into v_item_id;

    v_item_ids := array_append(v_item_ids, v_item_id);

    insert into public.inventory_movements (inventory_item_id, movement_type, quantity, reason)
    values (v_item_id, 'received', 1, 'Donation intake');

    if v_giveaway_id is not null then
      v_tier_id := null;
      v_tier_key := nullif(v_item->>'giveaway_tier', '');

      if v_tier_key is not null then
        select t.id into v_tier_id
        from public.giveaway_tiers t
        where t.giveaway_id = v_giveaway_id and t.key = v_tier_key;
      end if;

      if v_tier_id is null then
        select concat_ws(' ', g.label, c.label, v_item->>'type')
        into v_tier_text
        from public.inventory_categories c
        join public.inventory_category_groups g on g.id = c.group_id
        where c.id = v_category_id;

        v_tier_id := public.suggest_giveaway_tier(
          v_giveaway_id, coalesce(v_tier_text, v_item->>'type')
        );
      end if;

      if v_tier_id is null then
        v_untiered := array_append(v_untiered, v_item_id);
      else
        -- Every donated item grants its own bundle, uncapped (issue #5).
        perform public.grant_giveaway_tickets(
          v_giveaway_id, v_tier_id, 1, v_donation_id, v_item_id, null
        );
      end if;
    end if;
  end loop;

  return query select v_donation_id, v_item_ids, v_giveaway_id, v_untiered;
end;
$$;

drop policy "inventory_category_groups select" on public.inventory_category_groups;
create policy "inventory_category_groups select" on public.inventory_category_groups for select to authenticated
  using (tenant_id = (select public.current_tenant_id()));

drop policy "inventory_categories select" on public.inventory_categories;
create policy "inventory_categories select" on public.inventory_categories for select to authenticated
  using (tenant_id = (select public.current_tenant_id()));

-- Audit trigger --------------------------------------------------------------

create or replace function public.audit_log_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pk_column text;
  v_redacted text[];
  v_old_id uuid;
  v_new_id uuid;
  v_tenant_id uuid;
begin
  select pk_column, redacted_columns into v_pk_column, v_redacted
    from public.audited_tables where table_name = TG_TABLE_NAME;

  if TG_TABLE_NAME = 'retention_policies' then
    if TG_OP <> 'INSERT' then
      execute format('select extensions.uuid_generate_v5(extensions.uuid_ns_dns(), ($1).%I::text)', v_pk_column)
        into v_old_id using OLD;
    end if;
    if TG_OP <> 'DELETE' then
      execute format('select extensions.uuid_generate_v5(extensions.uuid_ns_dns(), ($1).%I::text)', v_pk_column)
        into v_new_id using NEW;
    end if;
  else
    if TG_OP <> 'INSERT' then
      execute format('select ($1).%I', v_pk_column) into v_old_id using OLD;
    end if;
    if TG_OP <> 'DELETE' then
      execute format('select ($1).%I', v_pk_column) into v_new_id using NEW;
    end if;
  end if;

  v_redacted := coalesce(v_redacted, '{}');

  -- From the row, not the session: null for the global tables, and correct
  -- under anon and cron where there is no session at all.
  if TG_OP = 'DELETE' then
    v_tenant_id := (to_jsonb(OLD) ->> 'tenant_id')::uuid;
  else
    v_tenant_id := (to_jsonb(NEW) ->> 'tenant_id')::uuid;
  end if;

  if TG_OP = 'DELETE' then
    insert into public.audit_log (tenant_id, table_name, record_id, action, actor_id, old_data, new_data)
    values (v_tenant_id, TG_TABLE_NAME, v_old_id, 'delete', auth.uid(), to_jsonb(OLD) - v_redacted, null);
    return OLD;
  elsif TG_OP = 'UPDATE' then
    insert into public.audit_log (tenant_id, table_name, record_id, action, actor_id, old_data, new_data)
    values (v_tenant_id, TG_TABLE_NAME, v_new_id, 'update', auth.uid(), to_jsonb(OLD) - v_redacted, to_jsonb(NEW) - v_redacted);
    return NEW;
  else
    insert into public.audit_log (tenant_id, table_name, record_id, action, actor_id, old_data, new_data)
    values (v_tenant_id, TG_TABLE_NAME, v_new_id, 'insert', auth.uid(), null, to_jsonb(NEW) - v_redacted);
    return NEW;
  end if;
end;
$$;
