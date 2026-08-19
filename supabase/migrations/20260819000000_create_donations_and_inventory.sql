-- Donation intake: donors, donations, inventory items, and inventory movements.
-- auto_expose_new_tables defaults to unset (not auto-exposed) in this project's config,
-- so explicit grants are required alongside RLS policies.

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$$;

create table public.donors (
  id uuid primary key default gen_random_uuid(),
  name text,
  is_anonymous boolean not null default false,
  source_type text not null check (source_type in ('individual', 'brand', 'organization', 'event', 'other')),
  email text,
  phone text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id),
  constraint donor_identified_or_anonymous check (is_anonymous or name is not null)
);

create table public.donations (
  id uuid primary key default gen_random_uuid(),
  donor_id uuid not null references public.donors(id),
  donated_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id)
);

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  donation_id uuid not null references public.donations(id),
  description text not null,
  size text,
  type text not null,
  gender text check (gender in ('unisex', 'men', 'women', 'kids', 'other')),
  condition text not null check (condition in ('new', 'like_new', 'good', 'fair', 'poor')),
  face_value numeric(10, 2) check (face_value is null or face_value >= 0),
  photo_url text,
  status text not null default 'available'
    check (status in ('available', 'distributed', 'damaged', 'lost', 'retired', 'other')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id)
);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  inventory_item_id uuid not null references public.inventory_items(id),
  movement_type text not null
    check (movement_type in ('received', 'distributed', 'reserved', 'damaged', 'lost', 'retired', 'corrected', 'other')),
  quantity integer not null default 1 check (quantity > 0),
  occurred_at timestamptz not null default now(),
  reason text,
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id)
);

create trigger set_updated_at before update on public.donors
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.donations
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.inventory_items
  for each row execute function public.set_updated_at();

alter table public.donors enable row level security;
alter table public.donations enable row level security;
alter table public.inventory_items enable row level security;
alter table public.inventory_movements enable row level security;

create policy "authenticated full access" on public.donors
  for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "authenticated full access" on public.donations
  for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "authenticated full access" on public.inventory_items
  for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "authenticated full access" on public.inventory_movements
  for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

grant select, insert, update, delete on public.donors to authenticated;
grant select, insert, update, delete on public.donations to authenticated;
grant select, insert, update, delete on public.inventory_items to authenticated;
grant select, insert, update, delete on public.inventory_movements to authenticated;

-- Creates a donor + donation + inventory item + receipt movement in one transaction.
create or replace function public.create_donation_with_item(
  p_donor_name text,
  p_donor_is_anonymous boolean,
  p_donor_source_type text,
  p_donor_email text,
  p_donor_phone text,
  p_donor_notes text,
  p_item_description text,
  p_item_size text,
  p_item_type text,
  p_item_gender text,
  p_item_condition text,
  p_item_face_value numeric,
  p_item_notes text
) returns table(donation_id uuid, inventory_item_id uuid)
language plpgsql
security invoker
as $$
declare
  v_donor_id uuid;
  v_donation_id uuid;
  v_item_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.donors (name, is_anonymous, source_type, email, phone, notes)
  values (p_donor_name, p_donor_is_anonymous, p_donor_source_type, p_donor_email, p_donor_phone, p_donor_notes)
  returning id into v_donor_id;

  insert into public.donations (donor_id)
  values (v_donor_id)
  returning id into v_donation_id;

  insert into public.inventory_items
    (donation_id, description, size, type, gender, condition, face_value, notes)
  values
    (v_donation_id, p_item_description, p_item_size, p_item_type, p_item_gender, p_item_condition, p_item_face_value, p_item_notes)
  returning id into v_item_id;

  insert into public.inventory_movements (inventory_item_id, movement_type, quantity, reason)
  values (v_item_id, 'received', 1, 'Donation intake');

  return query select v_donation_id, v_item_id;
end;
$$;

grant execute on function public.create_donation_with_item to authenticated;
