-- Public volunteer application intake (issue #161): anonymous visitors on
-- /get-involved submit an interest form. Persisted (not email-only) so
-- staff have a portal-ready queue to follow up on, per the issue's own
-- "revisit persistence if staff need a portal queue" call. Role interest is
-- free text for now -- #60 (public volunteer_role_types feed) hasn't
-- landed, so there's no public catalog to tie a foreign key to yet.
--
-- Same anon-bypass reasoning as event_registrations (20260823090000):
-- anonymous visitors never get direct table access, only the
-- submit_volunteer_application() RPC below, which enforces the honeypot
-- and per-email throttle atomically before inserting.

create table public.volunteer_applications (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id),
  name text not null,
  email text not null,
  phone text,
  role_interest text,
  availability text,
  status text not null default 'new'
    check (status in ('new', 'contacted', 'placed', 'declined', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at before update on public.volunteer_applications
  for each row execute function public.set_updated_at();

alter table public.volunteer_applications enable row level security;

create policy "volunteer_applications select" on public.volunteer_applications for select to authenticated
  using (public.has_permission('volunteers', 'view'));
create policy "volunteer_applications update" on public.volunteer_applications for update to authenticated
  using (public.has_permission('volunteers', 'manage')) with check (public.has_permission('volunteers', 'manage'));
create policy "volunteer_applications delete" on public.volunteer_applications for delete to authenticated
  using (public.has_permission('volunteers', 'manage'));

grant select, update, delete on public.volunteer_applications to authenticated;

create function public.submit_volunteer_application(
  p_name text,
  p_email text,
  p_phone text,
  p_role_interest text,
  p_availability text,
  p_honeypot text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person_id uuid;
  v_application_id uuid;
  v_recent_count integer;
begin
  -- Honeypot: a field real users never see or fill; bots that autofill
  -- every input trip it. Report a fake success so probing bots learn
  -- nothing was rejected.
  if p_honeypot is not null and p_honeypot <> '' then
    return gen_random_uuid();
  end if;

  if p_name is null or btrim(p_name) = '' then
    raise exception 'NAME_REQUIRED';
  end if;
  if p_email is null or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'INVALID_EMAIL';
  end if;

  select count(*) into v_recent_count
  from public.volunteer_applications
  where lower(email) = lower(p_email) and created_at > now() - interval '1 day';

  if v_recent_count > 0 then
    raise exception 'ALREADY_SUBMITTED';
  end if;

  v_person_id := public.resolve_or_create_person_by_email(
    p_name, p_email, p_phone, null, 'other', 'is_volunteer'
  );

  insert into public.volunteer_applications (person_id, name, email, phone, role_interest, availability)
  values (v_person_id, p_name, p_email, p_phone, p_role_interest, p_availability)
  returning id into v_application_id;

  return v_application_id;
end;
$$;

grant execute on function public.submit_volunteer_application to anon, authenticated;
