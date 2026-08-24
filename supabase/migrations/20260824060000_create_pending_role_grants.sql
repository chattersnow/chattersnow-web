-- Pre-account role staging: lets an admin grant a role to an email address
-- before that person has ever signed in. user_roles.user_id is a hard FK to
-- auth.users(id), so a role can't be inserted until the person's auth.users
-- row exists (i.e. they've signed in via Google at least once) -- this table
-- holds the staged grant until then. claim_pending_role_grants() (security
-- definer, same shape as resolve_current_person_id in
-- 20260823140000) is called both from the OAuth callback (required -- the
-- portal layout checks permissions on the very first page render) and from
-- getCurrentUserPermissions() on every subsequent page load, so a grant
-- staged after someone already has an account (but zero roles) is picked up
-- without forcing a re-login.
--
-- No 'expired' status and no cleanup job: expiry is enforced at claim time
-- via expires_at, and the UI derives an "expired" label from status +
-- expires_at rather than a background sweep flipping rows on its own.

create table public.pending_role_grants (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  role_id uuid not null references public.roles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'claimed', 'revoked')),
  expires_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  claimed_by uuid references auth.users(id),
  claimed_at timestamptz,
  revoked_by uuid references auth.users(id),
  revoked_at timestamptz
);

-- Partial (status = 'pending') so a claimed/revoked grant doesn't block
-- re-staging the same email+role later.
create unique index pending_role_grants_active_key
  on public.pending_role_grants (lower(trim(email)), role_id)
  where status = 'pending';

create index pending_role_grants_email_idx on public.pending_role_grants (lower(trim(email)));

alter table public.pending_role_grants enable row level security;

create policy "admin manage pending_role_grants" on public.pending_role_grants
  for all to authenticated
  using (public.has_permission('administration', 'manage'))
  with check (public.has_permission('administration', 'manage'));

grant select, insert, update, delete on public.pending_role_grants to authenticated;

-- Same audited set as user_roles (20260822120000): a granted/revoked
-- pending-access row is an administration action and belongs in the same
-- trail, not silent.
do $$
declare
  v_constraint_name text;
begin
  select conname into v_constraint_name
  from pg_constraint
  where conrelid = 'public.audit_log'::regclass and contype = 'c' and conname like '%table_name%';

  if v_constraint_name is not null then
    execute format('alter table public.audit_log drop constraint %I', v_constraint_name);
  end if;
end $$;

alter table public.audit_log
  add constraint audit_log_table_name_check
  check (table_name in ('donations', 'inventory_items', 'inventory_movements', 'event_expenses', 'user_roles', 'app_settings', 'calendar_items', 'pending_role_grants'));

create trigger audit_log_row after insert or update or delete on public.pending_role_grants
  for each row execute function public.audit_log_row();

-- security definer so a non-admin signing in can claim their own pending
-- grants despite having no administration:manage permission (same reasoning
-- as resolve_current_person_id). Checks the match count before mutating so
-- an exception can only originate from the mutation path -- i.e. it can only
-- ever fail when a pending grant actually existed for this email, never for
-- an unrelated user with nothing staged.
create function public.claim_pending_role_grants()
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

  select count(*) into v_matched
  from public.pending_role_grants
  where status = 'pending'
    and lower(trim(email)) = lower(trim(v_email))
    and (expires_at is null or expires_at > now());

  if v_matched = 0 then
    return 0;
  end if;

  insert into public.user_roles (user_id, role_id, created_by)
  select auth.uid(), prg.role_id, prg.created_by
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

grant execute on function public.claim_pending_role_grants() to authenticated;
