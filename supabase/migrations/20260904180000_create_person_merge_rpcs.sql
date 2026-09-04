-- The admin half of making people.email unique
-- (20260904170000_normalize_person_email.sql). Prod already holds duplicate
-- people rows, so the unique index cannot go on until somebody resolves them,
-- and resolving them is not a job for a one-off script: which record survives
-- and which name/phone/notes it keeps are judgement calls, and the duplicates
-- keep arriving from public intake anyway. So this ships merging as a portal
-- feature -- People > Duplicates -- rather than as a migration-time cleanup.
--
-- Nothing here merges anything on its own. find_duplicate_people() lists
-- collisions, person_merge_preview()/person_merge_blockers() let the review
-- screen show what will move and what stands in the way, and merge_people()
-- acts only on an explicit (survivor, duplicate) pair an admin chose.

-- people carries no audit_log trigger (it is not in the audited set,
-- 20260822120000 / 20260828060000) and a merge is irreversible, so this table
-- is the only record that one happened. Modelled on audit_log: a select policy
-- and no write policy at all, because the only writer is a security definer
-- function that bypasses RLS.
create table public.person_merges (
  id uuid primary key default gen_random_uuid(),
  -- Neither id carries an FK. The merged row is already gone by the time this
  -- one is written, and an append-only audit record has to outlive the
  -- survivor too: an FK here would either block deleting a person who has ever
  -- absorbed another, or cascade away the only record that the merge happened.
  -- merged_snapshot / survivor_before carry everything a reader needs.
  survivor_person_id uuid not null,
  merged_person_id uuid not null,
  merged_by uuid references auth.users(id) default auth.uid(),
  merged_at timestamptz not null default now(),
  -- to_jsonb of the deleted row, and of the survivor before its fields were
  -- resolved -- together these are what a hand-rollback would need.
  merged_snapshot jsonb not null,
  survivor_before jsonb not null,
  -- {"donations": 3, "event_registrations": 1} -- what actually moved.
  repointed jsonb not null
);

create index person_merges_survivor_idx on public.person_merges (survivor_person_id);
create index person_merges_merged_at_idx on public.person_merges (merged_at desc);

alter table public.person_merges enable row level security;

create policy "person_merges select" on public.person_merges for select to authenticated
  using (public.has_permission('people', 'manage'));

grant select on public.person_merges to authenticated;

-- One row per person that shares an address with another, ordered so the caller
-- can group by email_key without a second query. security definer for the same
-- reason the rest of this file is: the screen is gated on people:manage, which
-- is stricter than the people select policy, and the gate is checked here
-- rather than trusted from the route.
create function public.find_duplicate_people()
returns table (
  email_key text,
  id uuid,
  name text,
  preferred_name text,
  person_type text,
  email text,
  auth_user_id uuid,
  created_at timestamptz
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
       and exists (
         select 1 from public.people q
          where q.id <> p.id
            and not q.is_anonymous
            and lower(q.email) = lower(p.email)
       )
     order by lower(p.email), p.created_at;
end;
$$;

grant execute on function public.find_duplicate_people() to authenticated;

-- Everything that would make merge_people() raise, gathered up front so the
-- review screen can disable Submit and say why, instead of the admin filling in
-- a survivor picker and losing it to an error on submit.
--
-- 'advisory' rows are not blockers: they are the organization-vs-individual
-- case, where the right answer is usually person_organizations or
-- primary_contact_person_id (20260830100000 / 20260830150000) rather than a
-- merge, but staff may still legitimately want to merge.
create function public.person_merge_blockers(
  p_survivor_id uuid,
  p_duplicate_id uuid
)
returns table (kind text, table_name text, detail text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_survivor public.people;
  v_duplicate public.people;
begin
  if not public.has_permission('people', 'manage') then
    raise exception 'Not authorized';
  end if;

  select * into v_survivor from public.people where id = p_survivor_id;
  if not found then
    raise exception 'No such person';
  end if;

  select * into v_duplicate from public.people where id = p_duplicate_id;
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

grant execute on function public.person_merge_blockers(uuid, uuid) to authenticated;

-- What merge_people() would move, counted per referencing column. Driven by the
-- same pg_constraint discovery loop as the merge itself so the review screen's
-- numbers cannot drift from what actually happens.
create function public.person_merge_preview(
  p_survivor_id uuid,
  p_duplicate_id uuid
)
returns table (table_name text, column_name text, survivor_count bigint, duplicate_count bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_survivor bigint;
  v_duplicate bigint;
begin
  if not public.has_permission('people', 'manage') then
    raise exception 'Not authorized';
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

grant execute on function public.person_merge_preview(uuid, uuid) to authenticated;

-- Move every record from p_duplicate_id onto p_survivor_id, resolve the
-- survivor's own fields, and delete the duplicate.
--
-- p_field_overrides is the admin's field-by-field pick from the review screen.
-- It is applied through an explicit allowlist and a static UPDATE, never as
-- dynamic SQL over its keys: this function is security definer, so accepting
-- arbitrary column names would let any people:manage holder write id,
-- auth_user_id or created_by.
create function public.merge_people(
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
begin
  if not public.has_permission('people', 'manage') then
    raise exception 'Not authorized';
  end if;

  if p_survivor_id = p_duplicate_id then
    raise exception 'A person cannot be merged into themselves';
  end if;

  -- Lock both rows for the duration; a concurrent merge of the same pair would
  -- otherwise repoint half the records each.
  select * into v_survivor from public.people where id = p_survivor_id for update;
  if not found then
    raise exception 'No such person';
  end if;

  select * into v_duplicate from public.people where id = p_duplicate_id for update;
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

grant execute on function public.merge_people(uuid, uuid, jsonb) to authenticated;
