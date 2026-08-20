-- Sponsors/partners for an event, including in-kind support tracking.
create table public.event_sponsors (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  contact_name text,
  contact_email text,
  contact_phone text,
  support_type text not null default 'in_kind'
    check (support_type in ('cash', 'in_kind', 'both', 'other')),
  in_kind_description text,
  contribution_value numeric(10, 2) check (contribution_value is null or contribution_value >= 0),
  is_public boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id)
);

create trigger set_updated_at before update on public.event_sponsors
  for each row execute function public.set_updated_at();

alter table public.event_sponsors enable row level security;

create policy "authenticated full access" on public.event_sponsors
  for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

grant select, insert, update, delete on public.event_sponsors to authenticated;
