-- Roles and entitlements (spec §5.3/§6): named roles, user-to-role
-- assignments, and helper functions used by RLS policies and the app to
-- check a caller's roles. security definer + owned by the migration role so
-- these bypass RLS on roles/user_roles themselves (avoids recursive policies)
-- while still only ever reporting the calling user's own roles (auth.uid()).

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
    check (name in ('admin', 'event_coordinator', 'finance', 'board', 'volunteer')),
  description text
);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  unique (user_id, role_id)
);

insert into public.roles (name, description) values
  ('admin', 'Full access to every portal section, including Administration'),
  ('event_coordinator', 'Manages events end-to-end: details, sponsors, raffle, attendance, event expenses'),
  ('finance', 'Manages donations, expenses, reimbursements, and financial reports'),
  ('board', 'Manages governance records'),
  ('volunteer', 'Views events, signs up, records donation intake and distribution, logs own participation');

create function public.has_role(p_role text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = auth.uid() and r.name = p_role
  );
$$;

create function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.has_role('admin');
$$;

create function public.my_roles()
returns text[]
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(array_agg(r.name order by r.name), '{}')
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.user_id = auth.uid();
$$;

grant execute on function public.has_role(text) to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.my_roles() to authenticated;

alter table public.roles enable row level security;
alter table public.user_roles enable row level security;

create policy "authenticated read roles" on public.roles
  for select to authenticated using (true);
create policy "admin manage roles" on public.roles
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "user views own roles" on public.user_roles
  for select to authenticated using (user_id = auth.uid());
create policy "admin manage user_roles" on public.user_roles
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select on public.roles to authenticated;
grant select, insert, update, delete on public.user_roles to authenticated;

-- Bootstrap admin: seed the admin role for the account this account already
-- signs in with, if it exists yet. No-op locally where that account hasn't
-- logged in yet; safe to run on production where it has.
do $$
declare
  v_user_id uuid;
  v_admin_role_id uuid;
begin
  select id into v_admin_role_id from public.roles where name = 'admin';

  select id into v_user_id from auth.users where email = 'ricardo.dev.js@gmail.com' limit 1;
  if v_user_id is not null then
    insert into public.user_roles (user_id, role_id, created_by)
    values (v_user_id, v_admin_role_id, v_user_id)
    on conflict (user_id, role_id) do nothing;
  end if;
end $$;
