-- Events: basic event info only. Expenses, raffles, and sponsors are separate,
-- FK-referencing tables to be added in later migrations (see docs/technical-spec.md §6).

create table public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  timezone text not null,
  visibility text not null default 'private' check (visibility in ('public', 'private')),
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id),
  constraint events_end_after_start check (ends_at is null or ends_at >= starts_at)
);

create trigger set_updated_at before update on public.events
  for each row execute function public.set_updated_at();

alter table public.events enable row level security;

create policy "authenticated full access" on public.events
  for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

grant select, insert, update, delete on public.events to authenticated;
