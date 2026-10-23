-- #1689 (part of #1685): managing per-event access grants. #1686 built the
-- grants and their checks; this is what the portal needs to give, list and
-- take them away, and to choose the tenant's offered areas.
--
-- INVITES. A grant needs an account, and a partner's coordinator usually has
-- none. `pending_event_access_grants` stages a grant for an email address the
-- way `pending_role_grants` stages a role: the same address rule (#759,
-- email_is_this_tenants_to_invite()), and claimed by the same
-- claim_pending_role_grants() every sign-in path already calls. Claiming turns
-- the invite into an `event_access_grants` row and deletes it; revoking an
-- invite deletes it too. The audit log keeps both histories.
--
-- LISTING. Coordinators with `events: manage` see who has access to an event
-- but cannot change it (#1685: only `administration: manage` grants).
-- event_access_grants' own select policy stays admin-or-grantee, so the list
-- is list_event_access(), which also resolves names the caller could not
-- otherwise read (auth.users).
--
-- OFFERED AREAS. app_settings is written by `system_settings: manage`, but who
-- may grant what is an administration question, so the setting has its own
-- writer, set_event_access_offered_areas(), gated on `administration: manage`.
-- Withdrawing an area leaves the grant rows alone; has_event_access() already
-- ignores an area the tenant no longer offers.

-- ---------------------------------------------------------------------------
-- 1. The offered areas of a named tenant
-- ---------------------------------------------------------------------------

-- event_access_offered_areas() answers for the session's tenant; the claim
-- below runs before a guest has one. Same rule, the tenant named.
create function public.event_access_tenant_offered_areas(p_tenant_id uuid)
returns text[]
language sql
security definer
set search_path = public
stable
as $$
  with setting as (
    select s.value
      from public.app_settings s
     where s.tenant_id = p_tenant_id
       and s.key = 'event_access.offered_areas'
       and jsonb_typeof(s.value) = 'array'
  )
  select coalesce(array_agg(a.key order by a.sort_order), '{}')
    from public.event_access_areas a
   where case
     when exists (select 1 from setting)
     then (select setting.value from setting) ? a.key
     else not a.sensitive
   end;
$$;

revoke all on function public.event_access_tenant_offered_areas(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Invites
-- ---------------------------------------------------------------------------

create table public.pending_event_access_grants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) default public.default_tenant_id(),
  event_id uuid not null,
  email text not null
    constraint pending_event_access_grants_email_check check (position('@' in email) > 1),
  level text not null
    constraint pending_event_access_grants_level_check check (level in ('view', 'manage')),
  areas text[] not null
    constraint pending_event_access_grants_areas_check check (cardinality(areas) > 0),
  invited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_by uuid references auth.users (id) on delete set null,
  constraint pending_event_access_grants_event_fkey
    foreign key (tenant_id, event_id)
    references public.events (tenant_id, id) on delete cascade
);

comment on table public.pending_event_access_grants is
  'A per-event access grant staged for an email address with no account in the tenant yet (#1689). claim_pending_role_grants() turns it into an event_access_grants row at the invitee''s first sign-in and deletes it. Written only by administration: manage.';

create unique index pending_event_access_grants_event_email_key
  on public.pending_event_access_grants (tenant_id, event_id, lower(btrim(email)));
create index pending_event_access_grants_email_idx
  on public.pending_event_access_grants (lower(btrim(email)));

-- The grant's own rules apply: known, distinct, offered areas.
create trigger event_access_grants_check_areas
  before insert or update of areas on public.pending_event_access_grants
  for each row execute function public.event_access_grants_check_areas();

create trigger set_updated_at
  before update on public.pending_event_access_grants
  for each row execute function public.set_updated_at();

alter table public.pending_event_access_grants enable row level security;
revoke all on public.pending_event_access_grants from public, anon, authenticated;
grant select, insert, update, delete on public.pending_event_access_grants to authenticated;

create policy "pending_event_access_grants select" on public.pending_event_access_grants
  for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('administration', 'manage')
  );

-- The address test on insert only, for 20260906190000's reason: minting the
-- invite creates the account, after which the address no longer passes.
create policy "pending_event_access_grants insert" on public.pending_event_access_grants
  for insert to authenticated
  with check (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('administration', 'manage')
    and public.email_is_this_tenants_to_invite(email)
  );

create policy "pending_event_access_grants update" on public.pending_event_access_grants
  for update to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('administration', 'manage')
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('administration', 'manage')
  );

create policy "pending_event_access_grants delete" on public.pending_event_access_grants
  for delete to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('administration', 'manage')
  );

insert into public.audited_tables (table_name, pk_column) values
  ('pending_event_access_grants', 'id');

create trigger audit_log_row after insert or update or delete
  on public.pending_event_access_grants
  for each row execute function public.audit_log_row();

-- ---------------------------------------------------------------------------
-- 3. Claiming invites at sign-in
-- ---------------------------------------------------------------------------

-- 20260906030000's body unchanged, with the event invites claimed first.
-- Every sign-in path calls this and fails the sign-in on an error, so the
-- event half must not raise: an area the tenant withdrew since the invite is
-- dropped rather than tripping event_access_grants_check_areas, an invite left
-- with no offered area stays pending, and a grant the account already holds on
-- that event wins over the invite.
create or replace function public.claim_pending_role_grants()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_matched integer;
begin
  if auth.uid() is null then
    return 0;
  end if;

  select email into v_email from auth.users where id = auth.uid();
  if v_email is null then
    return 0;
  end if;

  with claimable as (
    select p.id, p.tenant_id, p.event_id, p.level, p.created_by,
           array(
             select a from unnest(p.areas) a
              where a = any (public.event_access_tenant_offered_areas(p.tenant_id))
           ) as areas
      from public.pending_event_access_grants p
     where lower(btrim(p.email)) = lower(btrim(v_email))
  ),
  granted as (
    insert into public.event_access_grants
      (tenant_id, event_id, user_id, level, areas, granted_by, created_by)
    select c.tenant_id, c.event_id, auth.uid(), c.level, c.areas, c.created_by, c.created_by
      from claimable c
     where cardinality(c.areas) > 0
    on conflict (tenant_id, event_id, user_id) do nothing
  )
  delete from public.pending_event_access_grants p
   using claimable c
   where p.id = c.id
     and cardinality(c.areas) > 0;

  select count(*) into v_matched
  from public.pending_role_grants
  where status = 'pending'
    and lower(trim(email)) = lower(trim(v_email))
    and (expires_at is null or expires_at > now());

  if v_matched = 0 then
    return 0;
  end if;

  -- Into the tenant the invite was staged in; ensure_membership_for_role
  -- joins the caller to it as an ordinary member.
  insert into public.user_roles (tenant_id, user_id, role_id, created_by)
  select prg.tenant_id, auth.uid(), prg.role_id, prg.created_by
  from public.pending_role_grants prg
  where prg.status = 'pending'
    and lower(trim(prg.email)) = lower(trim(v_email))
    and (prg.expires_at is null or prg.expires_at > now())
  on conflict (user_id, role_id) do nothing;

  update public.pending_role_grants
  set status = 'claimed', claimed_by = auth.uid(), claimed_at = now()
  where status = 'pending'
    and lower(trim(email)) = lower(trim(v_email))
    and (expires_at is null or expires_at > now());

  return v_matched;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Who has access to an event
-- ---------------------------------------------------------------------------

-- One account's address and the name this tenant knows it by: its person
-- record's preferred name or name, then the account's own, as
-- list_portal_users() shows them. No row for a null or deleted account.
create function public.event_access_account_name(p_user_id uuid)
returns table (email text, name text)
language sql
security definer
set search_path = public
stable
as $$
  select u.email::text,
         coalesce(
           nullif(btrim(p.preferred_name), ''),
           nullif(btrim(p.name), ''),
           nullif(btrim(coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name')), '')
         )
    from auth.users u
    left join public.people p
      on p.auth_user_id = u.id
     and p.tenant_id = (select public.current_tenant_id())
   where u.id = p_user_id
   limit 1;
$$;

revoke all on function public.event_access_account_name(uuid) from public, anon, authenticated;

-- Grants and invites on one event of the current tenant, for its Access card.
-- `events: manage` reads it; changing it is administration's. Names follow
-- list_portal_users(): the tenant's person record, then the account's own
-- name. Empty for anyone else, and for an event in another tenant.
create function public.list_event_access(p_event_id uuid)
returns table (
  kind text,
  id uuid,
  user_id uuid,
  email text,
  name text,
  level text,
  areas text[],
  granted_by_name text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select 'grant', g.id, g.user_id, who.email, who.name, g.level, g.areas,
         coalesce(granter.name, granter.email), g.created_at, g.updated_at
    from public.event_access_grants g
    cross join lateral public.event_access_account_name(g.user_id) who
    left join lateral public.event_access_account_name(g.granted_by) granter on true
   where g.event_id = p_event_id
     and g.tenant_id = (select public.current_tenant_id())
     and (public.has_permission('administration', 'manage')
          or public.has_permission('events', 'manage'))
  union all
  select 'invite', i.id, null, i.email, null, i.level, i.areas,
         coalesce(granter.name, granter.email), i.created_at, i.updated_at
    from public.pending_event_access_grants i
    left join lateral public.event_access_account_name(i.created_by) granter on true
   where i.event_id = p_event_id
     and i.tenant_id = (select public.current_tenant_id())
     and (public.has_permission('administration', 'manage')
          or public.has_permission('events', 'manage'))
   order by 9;
$$;

comment on function public.list_event_access(uuid) is
  'The per-event access grants and pending invites on one event of the current tenant (#1689), with the grantee''s and granter''s names. For administration: manage or events: manage; empty for anyone else. Security definer by design (#887): event_access_grants'' select policy is admin-or-grantee and names come from auth.users. Isolation is tenant_id = current_tenant_id().';

revoke all on function public.list_event_access(uuid) from public, anon;
grant execute on function public.list_event_access(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Choosing the offered areas
-- ---------------------------------------------------------------------------

create function public.set_event_access_offered_areas(p_areas text[])
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := (select public.current_tenant_id());
  v_value jsonb;
begin
  if v_tenant is null or not public.has_permission('administration', 'manage') then
    raise exception 'PERMISSION_DENIED';
  end if;

  if exists (
    select 1 from unnest(coalesce(p_areas, '{}')) a(key)
     where not exists (select 1 from public.event_access_areas x where x.key = a.key)
  ) then
    raise exception 'EVENT_ACCESS_AREA_UNKNOWN';
  end if;

  select coalesce(jsonb_agg(a.key order by a.sort_order), '[]'::jsonb)
    into v_value
    from public.event_access_areas a
   where a.key = any (coalesce(p_areas, '{}'));

  insert into public.app_settings (tenant_id, key, value, updated_by)
  values (v_tenant, 'event_access.offered_areas', v_value, auth.uid())
  on conflict (tenant_id, key)
  do update set value = excluded.value, updated_by = excluded.updated_by;

  return public.event_access_offered_areas();
end;
$$;

comment on function public.set_event_access_offered_areas(text[]) is
  'Sets the current tenant''s event_access.offered_areas (#1689), in catalog order, and returns it. administration: manage only -- app_settings'' own writer is system_settings: manage, and who may be granted what is an administration question. An empty list offers nothing. Existing grants are untouched; has_event_access() ignores a withdrawn area.';

revoke all on function public.set_event_access_offered_areas(text[]) from public, anon;
grant execute on function public.set_event_access_offered_areas(text[]) to authenticated;
