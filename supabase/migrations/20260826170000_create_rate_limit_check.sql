-- Issue #172: shared IP-based velocity check for public write paths (contact,
-- volunteer apply, event registration). There's no Redis/Upstash in the
-- stack, so this is a small Postgres-backed sliding-window counter, called
-- from inside each SECURITY DEFINER intake RPC below -- not exposed to anon
-- directly, same "anon has no direct table access" reasoning as
-- volunteer_applications/event_registrations.

create table public.rate_limit_hits (
  id bigint generated always as identity primary key,
  route text not null,
  ip_address inet,
  created_at timestamptz not null default now()
);

create index rate_limit_hits_route_ip_created_idx
  on public.rate_limit_hits (route, ip_address, created_at);

alter table public.rate_limit_hits enable row level security;
-- No policies and no grants: nobody gets direct access. Only the SECURITY
-- DEFINER function below (running as the table owner) touches this table.

create function public.check_rate_limit(
  p_route text,
  p_ip_address inet,
  p_max_attempts integer,
  p_window interval
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recent_count integer;
begin
  -- An absent IP (e.g. local dev without a forwarded-for header) can't be
  -- throttled per-caller; fail open rather than locking out every caller.
  if p_ip_address is null then
    return true;
  end if;

  select count(*) into v_recent_count
  from public.rate_limit_hits
  where route = p_route
    and ip_address = p_ip_address
    and created_at > now() - p_window;

  if v_recent_count >= p_max_attempts then
    return false;
  end if;

  insert into public.rate_limit_hits (route, ip_address) values (p_route, p_ip_address);
  return true;
end;
$$;

-- Not granted to anon/authenticated: only called from within other SECURITY
-- DEFINER intake RPCs, which run as the function owner and so already have
-- implicit execute rights on functions that owner created.
