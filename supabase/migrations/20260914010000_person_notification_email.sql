-- Renumbered from 20260913240000 (#1051): that version was claimed by two
-- files at once, and a migration version is the primary key of
-- supabase_migrations.schema_migrations, so only one of them could ever be
-- recorded. Hour 24 is not a valid timestamp either.

-- Issue #1042: a portal user's sign-in address and the address their mail goes
-- to are the same column, and they should not be.
--
-- resolve_current_person_id()/ensure_current_person() (20260906050000) bind an
-- account to a directory record on lower(people.email) = lower(auth.users.email)
-- and create the record from the account's own address when nothing matches.
-- Every outbound email then addresses people.email -- people_with_permission()
-- (20260910010000) for the public-submission notices, and the task digest's own
-- recipient query. So somebody who signs in with a personal Google account is
-- told about volunteer applications there, and the only way to move that today
-- is to edit people.email -- which is the fallback link key at sign-in, is
-- unique per tenant (20260906020000), and is what People > Duplicates matches
-- on.
--
-- Splitting the two is a new column rather than a rewrite of the old one:
-- people.email keeps identity and matching exactly as they are, and delivery
-- becomes coalesce(notification_email, email). A null override -- the normal
-- case, and every existing row -- reproduces today's behaviour precisely.

-- people_with_roles selects p.*, expanded at creation time, so a new people
-- column has to go through a drop and recreate (20260903030000, done this way
-- in 20260905060000). The computed relationship takes the view's composite type
-- as its argument, so it goes first and comes back after.
drop function public.primary_contact(public.people_with_roles);
drop view public.people_with_roles;

alter table public.people
  add column notification_email text
  check (
    notification_email is null
    or notification_email ~ '^[^[:space:]@]+@[^[:space:]@]+$'
  );

comment on column public.people.notification_email is
  'Where this person''s portal email is sent, when that is not the address they sign in with (#1042). Null means use `email`. Never used to identify or match a person: `email` remains the identity key that resolve_current_person_id() links an account on, that is unique per tenant, and that People > Duplicates matches.';

create view public.people_with_roles
with (security_invoker = true) as
select
  p.*,
  f.is_donor,
  f.is_sponsor,
  f.is_volunteer,
  f.is_attendee,
  f.is_staff,
  f.is_partner
from public.people p
cross join lateral public.person_role_flags(p.id) f;

grant select on public.people_with_roles to authenticated;

create function public.primary_contact(public.people_with_roles)
returns setof public.people
rows 1
language sql
stable
as $$
  select * from public.people where id = $1.primary_contact_person_id;
$$;

grant execute on function public.primary_contact(public.people_with_roles) to authenticated;

-- The same canonicalization people.email has had since 20260904170000, for the
-- same reason it is a trigger: every writer, including ones added later, rather
-- than a round of call-site edits.
--
-- The second half is new, and is what keeps retention honest. The rules in
-- run_retention_purge that anonymize a person (current body 20260913230000)
-- set is_anonymous and null the contact columns they name; they cannot name a
-- column added afterwards, and a 500-line function body restated by every
-- migration that touches it is the worst possible place to keep that list
-- current. An anonymized row holds no address of any kind, said once, where
-- every path that sets the flag meets it.
create or replace function public.normalize_person_email()
returns trigger
language plpgsql
as $$
begin
  new.email := nullif(lower(trim(new.email)), '');
  new.notification_email := nullif(lower(trim(new.notification_email)), '');

  if new.is_anonymous then
    new.notification_email := null;
  end if;

  return new;
end;
$$;

-- person_merges snapshots people rows, so the redaction register has to carry
-- the column or retention_unregistered_personal_columns() (20260907150000)
-- reports it -- which is that guard working: an email address is personal on
-- this schema wherever it appears.
insert into public.retention_snapshot_personal_columns (table_name, column_name)
values ('people', 'notification_email');

-- ---------------------------------------------------------------------------
-- Delivery
-- ---------------------------------------------------------------------------

-- The sessionless recipient resolver behind every public-submission notice.
-- Returning the override in the existing `email` column, rather than adding a
-- second one, is deliberate: every caller is a sender, the only address a
-- sender may use is the delivery address, and a second column named `email`
-- that a sender could reach for by mistake is the bug this migration exists to
-- prevent.
--
-- Body is 20260910010000's verbatim apart from that expression, the null check
-- it made necessary, and the grouping that follows from both.
create or replace function public.people_with_permission(
  p_tenant_id uuid,
  p_resource_keys text[],
  p_min_level text
)
returns table (
  person_id uuid,
  tenant_id uuid,
  email text,
  name text,
  preferred_name text
)
language sql
security definer
set search_path = public
stable
as $$
  select p.id, p.tenant_id, coalesce(p.notification_email, p.email), p.name, p.preferred_name
    from public.people p
    join public.user_roles ur
      on ur.user_id = p.auth_user_id
     and ur.tenant_id = p.tenant_id
    join public.role_permissions rp
      on rp.role_id = ur.role_id
     and rp.tenant_id = ur.tenant_id
    join public.resources res
      on res.id = rp.resource_id
   where p.tenant_id = p_tenant_id
     and res.key = any(p_resource_keys)
     and public.module_enabled_for_tenant(p_tenant_id, res.module_key)
     and coalesce(p.notification_email, p.email) is not null
     and p.auth_user_id is not null
     and not exists (
       select 1 from public.deactivated_users du
        where du.user_id = p.auth_user_id
     )
     and not exists (
       select 1 from public.tenant_memberships tm
        where tm.user_id = p.auth_user_id
          and tm.tenant_id = p.tenant_id
          and tm.kind = 'support'
     )
   group by p.id, p.tenant_id, p.notification_email, p.email, p.name, p.preferred_name
  having max(public.permission_rank(rp.level)) >= public.permission_rank(p_min_level);
$$;

-- ---------------------------------------------------------------------------
-- Reading and writing the override
-- ---------------------------------------------------------------------------

-- /portal/account renders the field it edits, so the resolver that page uses
-- has to return it. Adding an OUT column is a return-type change rather than a
-- replaceable body, so this drops first -- the same dance 20260905060000 did
-- for pronouns. Body is 20260906050000's verbatim apart from the added column.
drop function public.ensure_current_person();

create function public.ensure_current_person()
returns table (
  person_id uuid,
  name text,
  preferred_name text,
  pronouns text,
  email text,
  notification_email text
)
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
    select pp.id, pp.name, pp.preferred_name, pp.pronouns, pp.email, pp.notification_email
      from public.people pp
     where pp.id = v_person_id;
end;
$$;

grant execute on function public.ensure_current_person() to authenticated;

-- Self-serve: /portal/account. Modelled on set_my_pronouns (20260905060000) and
-- security definer for the reason it documents -- people update RLS requires
-- people:manage, which board and volunteer accounts do not hold, and where your
-- own mail arrives cannot be an administrator's decision to make for you.
create function public.set_my_notification_email(p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person_id uuid;
  v_email text := nullif(btrim(p_email), '');
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  -- Deliberately loose, and the same shape as the column's check constraint:
  -- this catches a stray word or a truncated paste, not an address a mail
  -- server would refuse. Only the provider can answer that, and its answer is
  -- recorded in the delivery ledger.
  if v_email is not null and v_email !~ '^[^[:space:]@]+@[^[:space:]@]+$' then
    raise exception 'That does not look like an email address';
  end if;

  select ecp.person_id into v_person_id from public.ensure_current_person() ecp;

  if v_person_id is null then
    raise exception 'No person record for the current user';
  end if;

  update public.people
     set notification_email = v_email
   where id = v_person_id;
end;
$$;

grant execute on function public.set_my_notification_email(text) to authenticated;

-- The administrator's side of the same field, from the Portal account card on a
-- person's record. people:manage rather than is_admin(): this writes one column
-- of one people row, which is the authority merge_people and the person form
-- already answer to. Tenant-scoped for the reason every security definer RPC
-- taking an id is (20260906050000) -- a foreign id reads as "No such person"
-- rather than leaking that it exists.
create function public.set_notification_email_for_person(
  p_person_id uuid,
  p_email text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := nullif(btrim(p_email), '');
  v_tenant_id uuid := public.current_tenant_id();
begin
  if not public.has_permission('people', 'manage') then
    raise exception 'Not authorized';
  end if;

  if v_email is not null and v_email !~ '^[^[:space:]@]+@[^[:space:]@]+$' then
    raise exception 'That does not look like an email address';
  end if;

  update public.people
     set notification_email = v_email
   where id = p_person_id
     and tenant_id = v_tenant_id;

  if not found then
    raise exception 'No such person';
  end if;
end;
$$;

grant execute on function public.set_notification_email_for_person(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Merge
-- ---------------------------------------------------------------------------

-- A merge writes the survivor's columns one by one, so a column it does not
-- name is silently dropped along with the duplicate row. The override follows
-- the rule email already follows: an explicit pick wins, else the survivor's,
-- else the duplicate's -- so merging a record that has an override into one
-- that has none keeps the override rather than quietly restoring delivery to
-- the sign-in address.
--
-- People > Duplicates does not offer it as a conflict to resolve, and does not
-- need to: the two-level fallback decides every case where only one side has a
-- value, and an override on both sides is an admin choosing between two
-- mailboxes for somebody else, which the person can correct at
-- /portal/account. Body is 20260913130000's verbatim apart from the one line.

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

  -- Pre-delete only where a duplicate row carries no payload the merge would
  -- lose, so the generic repoint below cannot collide on it.
  -- person_organizations is a bare membership. person_role_tags was one too
  -- until #1024 gave the sponsor tag an `is_public` flag that publishes an
  -- organization to the public sponsor wall, so that one value is carried
  -- across first and the assertion itself is still dropped.
  --
  -- True wins rather than the survivor's value, matching the coalesce(...)
  -- rule the field merge below uses: a merge should never take something off
  -- the public site, and unpublishing stays a deliberate tick in the person
  -- form. The survivor is the row that lives, so the flag is moved onto it
  -- before its duplicate goes.
  update public.person_role_tags s
     set is_public = true
    from public.person_role_tags d
   where s.person_id = p_survivor_id
     and d.person_id = p_duplicate_id
     and d.role = s.role
     and d.is_public
     and not s.is_public;

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
    notification_email = coalesce(v_o->>'notification_email', v_survivor.notification_email, v_duplicate.notification_email),
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
