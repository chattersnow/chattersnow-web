-- First-login tracking + the welcome tour flag. A new portal user lands with
-- no orientation, and the two header affordances that make the portal usable
-- are the least discoverable things in it: the help button is page-specific
-- (nothing says so) and the notifications bell renders nothing at all when
-- there's no pending work, so a new account may never learn it exists.
--
-- Keyed by auth.users(id), not people(id), for the reason
-- 20260824230000_create_deactivated_users.sql documents: this is portal-auth
-- identity state and every check keys off auth.uid(); a people row is
-- optional relative to that.
--
-- Unlike public.people -- whose RLS is permission-scoped, which is why
-- 20260902040000_create_person_provisioning_rpcs.sql needs security definer
-- functions just to let a user write their own name -- this table is
-- genuinely self-scoped, so the policies below carry the access rules and the
-- functions only exist to keep the upsert-then-read atomic.
--
-- Deliberately not added to the audit_log allow-list: this is per-user UI
-- state, not an administration action.

create table public.user_onboarding (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- Set once, by the insert below. The first time this account reached the
  -- portal; never updated afterwards.
  first_seen_at timestamptz not null default now(),
  -- Null means the welcome tour is still owed. Cleared again by
  -- reset_my_welcome() when a user replays it from /portal/account.
  welcome_completed_at timestamptz
);

alter table public.user_onboarding enable row level security;

-- Same self-scoped shape as the user_roles select policy
-- (20260821080000_create_roles_and_user_roles.sql).
create policy "user views own onboarding" on public.user_onboarding
  for select to authenticated
  using (user_id = auth.uid());

create policy "user creates own onboarding" on public.user_onboarding
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "user updates own onboarding" on public.user_onboarding
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- So the first-login data isn't write-only: Administration can read it.
create policy "administration views onboarding" on public.user_onboarding
  for select to authenticated
  using (public.has_permission('administration', 'view'));

grant select, insert, update on public.user_onboarding to authenticated;

-- Called on every portal layout render. The insert is a no-op after the first
-- one, so this settles into a plain read.
create function public.ensure_my_onboarding()
returns table (
  first_seen_at timestamptz,
  welcome_completed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;

  insert into public.user_onboarding (user_id)
  values (auth.uid())
  on conflict (user_id) do nothing;

  return query
    select uo.first_seen_at, uo.welcome_completed_at
      from public.user_onboarding uo
     where uo.user_id = auth.uid();
end;
$$;

grant execute on function public.ensure_my_onboarding() to authenticated;

-- Finishing or dismissing the tour. Idempotent: re-running keeps the original
-- completion time rather than sliding it forward.
create function public.complete_my_welcome()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  insert into public.user_onboarding (user_id, welcome_completed_at)
  values (auth.uid(), now())
  on conflict (user_id) do update
    set welcome_completed_at = coalesce(user_onboarding.welcome_completed_at, now());
end;
$$;

grant execute on function public.complete_my_welcome() to authenticated;

-- Replay, from /portal/account.
create function public.reset_my_welcome()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  insert into public.user_onboarding (user_id)
  values (auth.uid())
  on conflict (user_id) do update set welcome_completed_at = null;
end;
$$;

grant execute on function public.reset_my_welcome() to authenticated;

-- Backfill so first_seen_at is honest for accounts that predate this table,
-- rather than claiming everyone first arrived on the day it shipped.
-- welcome_completed_at stays null on purpose: existing users get the tour
-- once, which is the intended announcement.
insert into public.user_onboarding (user_id, first_seen_at)
select u.id, u.created_at from auth.users u
on conflict (user_id) do nothing;
