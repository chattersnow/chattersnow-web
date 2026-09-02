-- Expenses, optionally associated with an event.
create table public.event_expenses (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete set null,
  description text not null,
  expense_date date not null default current_date,
  amount numeric(10, 2) not null check (amount >= 0),
  currency text not null default 'USD',
  receipt_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id)
);

create trigger set_updated_at before update on public.event_expenses
  for each row execute function public.set_updated_at();

alter table public.event_expenses enable row level security;

create policy "authenticated full access" on public.event_expenses
  for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

grant select, insert, update, delete on public.event_expenses to authenticated;
