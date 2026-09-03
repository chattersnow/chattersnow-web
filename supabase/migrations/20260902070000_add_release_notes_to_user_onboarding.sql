-- "What's new" for returning users, on the same table as the first-login tour
-- (20260902060000). welcome_completed_at can't carry this on its own: it's a
-- one-shot timestamp, and release notes recur -- it has no way to say "saw the
-- September notes, hasn't seen October's".
--
-- last_release_seen holds a release key (a date string, e.g. '2026-09-03', so
-- it sorts lexically the way these migration filenames do). The app compares
-- it against a constant in src/app/portal/(app)/welcome/releases.ts and shows
-- the notes when it's behind. Null means "has never been shown any", which is
-- the correct state for every account that predates this column.

alter table public.user_onboarding
  add column last_release_seen text;

-- ensure_my_onboarding gains a parameter and a return column, so it has to be
-- dropped rather than replaced (see 20260824230000 for the same constraint on
-- list_portal_users).
drop function if exists public.ensure_my_onboarding();

create function public.ensure_my_onboarding(p_current_release text default null)
returns table (
  first_seen_at timestamptz,
  welcome_completed_at timestamptz,
  last_release_seen text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;

  -- p_current_release is stamped on creation only, never on later calls: a
  -- brand-new account gets the welcome tour and should not also be handed
  -- release notes about a portal it has never seen. Existing rows keep
  -- whatever they have, including null.
  insert into public.user_onboarding (user_id, last_release_seen)
  values (auth.uid(), p_current_release)
  on conflict (user_id) do nothing;

  return query
    select uo.first_seen_at, uo.welcome_completed_at, uo.last_release_seen
      from public.user_onboarding uo
     where uo.user_id = auth.uid();
end;
$$;

grant execute on function public.ensure_my_onboarding(text) to authenticated;

-- Dismissing the release notes. Takes the release the user was actually shown
-- rather than reading a server-side constant, so a stale tab can't mark a
-- newer release seen. Never moves the pointer backwards.
create function public.mark_release_seen(p_release text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  if p_release is null or trim(p_release) = '' then
    raise exception 'A release key is required';
  end if;

  insert into public.user_onboarding (user_id, last_release_seen)
  values (auth.uid(), p_release)
  on conflict (user_id) do update
    set last_release_seen = greatest(
      coalesce(user_onboarding.last_release_seen, ''),
      p_release
    );
end;
$$;

grant execute on function public.mark_release_seen(text) to authenticated;

-- Finishing the introduction catches you up on release notes too. Without
-- this, every account that takes the tour is immediately handed a "what's new"
-- modal right behind it -- including, on this very deploy, notes announcing
-- the tour they just finished. The rule generalizes past that: someone who was
-- invited months ago and signs in for the first time today gets introduced to
-- the portal wholesale, and has no use for a changelog of a portal they have
-- never seen.
drop function if exists public.complete_my_welcome();

create function public.complete_my_welcome(p_current_release text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  insert into public.user_onboarding (user_id, welcome_completed_at, last_release_seen)
  values (auth.uid(), now(), p_current_release)
  on conflict (user_id) do update
    -- Idempotent: re-running keeps the original completion time rather than
    -- sliding it forward, and never moves the release pointer backwards.
    set welcome_completed_at = coalesce(user_onboarding.welcome_completed_at, now()),
        -- nullif keeps the column null rather than storing '' when neither
        -- side has a release key.
        last_release_seen = nullif(
          greatest(
            coalesce(user_onboarding.last_release_seen, ''),
            coalesce(p_current_release, '')
          ),
          ''
        );
end;
$$;

grant execute on function public.complete_my_welcome(text) to authenticated;
