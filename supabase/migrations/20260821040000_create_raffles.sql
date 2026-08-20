-- Raffle ticket sales, prizes, and winners for an event.
-- Recording-only: public ticket sales require a legal/tax/jurisdictional
-- review before being enabled (see docs/technical-spec.md §5.8, §14).

create table public.raffles (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text,
  tickets_sold integer not null default 0 check (tickets_sold >= 0),
  ticket_price numeric(10, 2) check (ticket_price is null or ticket_price >= 0),
  revenue_amount numeric(10, 2) not null default 0 check (revenue_amount >= 0),
  drawing_date timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id),
  constraint raffles_one_per_event unique (event_id)
);

create table public.raffle_prizes (
  id uuid primary key default gen_random_uuid(),
  raffle_id uuid not null references public.raffles(id) on delete cascade,
  prize_name text not null,
  donor_name text,
  estimated_value numeric(10, 2) check (estimated_value is null or estimated_value >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id)
);

create table public.raffle_winners (
  id uuid primary key default gen_random_uuid(),
  raffle_prize_id uuid not null references public.raffle_prizes(id) on delete cascade,
  winner_name text not null,
  winner_contact text,
  distribution_status text not null default 'pending'
    check (distribution_status in ('pending', 'distributed', 'unclaimed', 'other')),
  distributed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id),
  constraint raffle_winners_one_per_prize unique (raffle_prize_id)
);

create trigger set_updated_at before update on public.raffles
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.raffle_prizes
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.raffle_winners
  for each row execute function public.set_updated_at();

alter table public.raffles enable row level security;
alter table public.raffle_prizes enable row level security;
alter table public.raffle_winners enable row level security;

create policy "authenticated full access" on public.raffles
  for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "authenticated full access" on public.raffle_prizes
  for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "authenticated full access" on public.raffle_winners
  for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

grant select, insert, update, delete on public.raffles to authenticated;
grant select, insert, update, delete on public.raffle_prizes to authenticated;
grant select, insert, update, delete on public.raffle_winners to authenticated;
