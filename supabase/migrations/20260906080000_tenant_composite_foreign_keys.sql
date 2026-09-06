-- Multi-tenancy Phase 3 (#707): a row can only reference a row in its own
-- tenant.
--
-- Row-level security decides which rows a session can see. It says nothing
-- about which rows a column may *point at*: a registration whose event_id is
-- another tenant's event is a perfectly valid row as far as a single-column
-- foreign key is concerned, and a security definer RPC that takes an id, or
-- a policy that trusts the parent's tenant, would follow it straight across.
-- Every parent table therefore gains `unique (tenant_id, id)`, and every
-- foreign key between two tenant tables becomes
--
--   foreign key (tenant_id, <column>) references <parent> (tenant_id, id)
--
-- so that a cross-tenant reference is rejected by the database itself,
-- whatever wrote it. The permission core got this treatment in Phase 2
-- (20260906030000); this extends it to the other 106 foreign keys.
--
-- Generated from the catalog, like 20260906070000: every single-column
-- foreign key whose child and parent both carry tenant_id, referencing the
-- parent's `id`. Each is recreated under its own name with its own ON DELETE
-- action, so nothing that relies on cascade or restrict behaviour changes.
-- ON DELETE SET NULL becomes `set null (<column>)` -- the Postgres 15+ form
-- that nulls the referencing column only; the bare form would try to null
-- tenant_id too and fail on its not-null constraint.
--
-- Left as they are: the composite `(<x>, giveaway_id) -> giveaway_*
-- (id, giveaway_id)` keys from 20260904100000, which pin a tier or package to
-- its giveaway -- giveaway_id on the same row is itself made composite with
-- tenant_id here, so those are tenant-bound transitively; and every key to
-- auth.users or to a global table (tenants, resources, retention_*).
--
-- Foreign keys are MATCH SIMPLE: a null referencing column still means "no
-- reference", tenant_id being non-null does not change that.
--
-- Two things PostgREST infers from foreign keys change with their width, and
-- both are handled:
--
-- - An embed hint by column name (`people!person_id(...)`) matches only a
--   single-column key. Every such hint in src/ now names the constraint
--   instead (`people!conflict_of_interest_disclosures_person_id_fkey(...)`),
--   which is why the constraint names are preserved here. Hints by
--   constraint name were already the convention for the four-way keys to
--   people on assets.
-- - A relationship embeds as one-to-one only when a unique or primary key
--   *constraint* covers exactly the key's columns. The eight keys whose
--   column carries a single-column unique get a mirrored
--   (tenant_id, column) unique, below, so they keep embedding as objects.
--
-- Three functions discover foreign keys to `people` from the catalog with an
-- `array_length(conkey, 1) = 1` filter -- merge_people(),
-- person_merge_preview() (20260904180000 / 20260905080000) and
-- retention_person_is_retained() (20260905120000). With those keys now two
-- columns wide the filter would match nothing and a merge would silently
-- repoint nothing, so they are rewritten below to pick out the column that
-- pairs with people.id whatever the key's width. Bodies are otherwise
-- unchanged.

do $$
declare
  v_fk record;
  v_parents text[] := '{}';
  v_action text;
  v_rebuilt integer := 0;
  v_one_to_one integer := 0;
begin
  for v_fk in
    select
      c.conname,
      c.conrelid::regclass as child,
      ch.relname as child_name,
      ca.attname as child_column,
      c.confrelid::regclass as parent,
      pa.relname as parent_name,
      c.confdeltype,
      c.confupdtype,
      c.condeferrable,
      c.condeferred
    from pg_constraint c
    join pg_class ch on ch.oid = c.conrelid
    join pg_class pa on pa.oid = c.confrelid
    join pg_namespace n on n.oid = ch.relnamespace and n.nspname = 'public'
    join pg_attribute ca on ca.attrelid = c.conrelid and ca.attnum = c.conkey[1]
    join pg_attribute fa on fa.attrelid = c.confrelid and fa.attnum = c.confkey[1]
    where c.contype = 'f'
      and pa.relnamespace = n.oid
      and array_length(c.conkey, 1) = 1
      and fa.attname = 'id'
      and exists (select 1 from pg_attribute a where a.attrelid = c.conrelid and a.attname = 'tenant_id' and not a.attisdropped)
      and exists (select 1 from pg_attribute a where a.attrelid = c.confrelid and a.attname = 'tenant_id' and not a.attisdropped)
    order by c.conrelid::regclass::text, c.conname
  loop
    if not (v_fk.parent_name = any (v_parents)) and not exists (
      select 1 from pg_constraint u
       where u.conrelid = v_fk.parent::regclass
         and u.contype = 'u'
         and u.conname = v_fk.parent_name || '_tenant_id_id_key'
    ) then
      execute format('alter table %s add constraint %I unique (tenant_id, id)',
        v_fk.parent, v_fk.parent_name || '_tenant_id_id_key');
    end if;
    v_parents := array_append(v_parents, v_fk.parent_name);

    v_action := case v_fk.confdeltype
      when 'a' then 'no action'
      when 'r' then 'restrict'
      when 'c' then 'cascade'
      when 'n' then format('set null (%I)', v_fk.child_column)
      when 'd' then format('set default (%I)', v_fk.child_column)
    end;

    execute format('alter table %s drop constraint %I', v_fk.child, v_fk.conname);
    execute format(
      'alter table %s add constraint %I foreign key (tenant_id, %I) references %s (tenant_id, id) on delete %s%s',
      v_fk.child, v_fk.conname, v_fk.child_column, v_fk.parent, v_action,
      case when v_fk.condeferrable then ' deferrable' || case when v_fk.condeferred then ' initially deferred' else '' end else '' end
    );
    v_rebuilt := v_rebuilt + 1;

    -- PostgREST embeds a relationship as one-to-one only when a unique or
    -- primary key constraint covers exactly the foreign key's columns
    -- (indexes do not count). Eight of these keys sit on a single-column
    -- unique -- one giveaway per event, one logistics row per event, one
    -- content opportunity per calendar item -- and the app reads them as
    -- objects, not arrays. Mirroring each as (tenant_id, column) keeps that
    -- cardinality; it is implied by the single-column unique and costs one
    -- small index.
    if exists (
      select 1 from pg_constraint u
       where u.conrelid = v_fk.child::regclass
         and u.contype in ('u', 'p')
         and u.conkey = array[(select attnum from pg_attribute where attrelid = v_fk.child::regclass and attname = v_fk.child_column)]
    ) then
      execute format('alter table %s add constraint %I unique (tenant_id, %I)',
        v_fk.child, v_fk.child_name || '_tenant_' || v_fk.child_column || '_key', v_fk.child_column);
      v_one_to_one := v_one_to_one + 1;
    end if;
  end loop;

  raise notice '% foreign keys now reference (tenant_id, id); % one-to-one uniques mirrored', v_rebuilt, v_one_to_one;
end $$;

-- Functions that discover foreign keys to people ------------------------------

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
      join lateral unnest(c.conkey, c.confkey) as k(child_attnum, parent_attnum) on true
      join pg_attribute pa on pa.attrelid = c.confrelid and pa.attnum = k.parent_attnum and pa.attname = 'id'
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.child_attnum
     where c.contype = 'f'
       and c.confrelid = 'public.people'::regclass
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

create or replace function public.retention_person_is_retained(p_person_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_ref record;
  v_referenced boolean;
begin
  for v_ref in
    select c.conrelid::regclass::text as tbl, a.attname::text as col
      from pg_constraint c
      join lateral unnest(c.conkey, c.confkey) as k(child_attnum, parent_attnum) on true
      join pg_attribute pa on pa.attrelid = c.confrelid and pa.attnum = k.parent_attnum and pa.attname = 'id'
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.child_attnum
     where c.contype = 'f'
       and c.confrelid = 'public.people'::regclass
  loop
    if exists (
      select 1 from public.retention_purgeable_person_refs r
       where r.table_name = v_ref.tbl and r.column_name = v_ref.col
    ) then
      continue;
    end if;

    execute format(
      'select exists (select 1 from %s t where t.%I = $1)', v_ref.tbl, v_ref.col
    ) into v_referenced using p_person_id;

    if v_referenced then
      return true;
    end if;
  end loop;

  return false;
end;
$$;
