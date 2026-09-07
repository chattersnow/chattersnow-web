-- Giveaway tier and ticket system (issue #5).
--
-- The existing giveaway tables model a flat paid raffle: three aggregate
-- numbers (tickets_sold, ticket_price, revenue_amount) on one row per event.
-- What Chatter actually runs is tiered: tickets come in colours tied to tiers,
-- and participants earn them two ways -- by donating gear (the item's category
-- sets the tier) or by buying a ticket package (a handful of price points, each
-- matching a tier). Both paths run at the same giveaway.
--
-- The design keeps one grant matrix serving both paths, and funnels every
-- issued ticket into a single giveaway_ticket_grants pool, so per-colour totals
-- and per-bucket odds are one aggregate regardless of how a ticket was
-- obtained. Odds are exactly what the official-rules work (issue #666) needs.
--
-- Tier membership is enforced structurally rather than by trigger: every table
-- that points at a tier carries giveaway_id and uses a composite foreign key
-- into giveaway_tiers(id, giveaway_id), so a bucket, package or grant can never
-- reference a tier belonging to a different giveaway.

-- Composite-FK target. Redundant with the primary key, but a composite foreign
-- key needs a matching unique constraint to reference.
create table public.giveaway_tiers (
  id uuid primary key default gen_random_uuid(),
  giveaway_id uuid not null references public.giveaways(id) on delete cascade,
  key text not null,
  label text not null,
  rank integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id),
  constraint giveaway_tiers_key_per_giveaway unique (giveaway_id, key),
  constraint giveaway_tiers_id_giveaway unique (id, giveaway_id)
);

-- The matrix. One row per (donated/purchased tier, ticket colour) pair, so the
-- gold row of the table in issue #5 is three rows: 3 gold, 1 silver, 1 bronze.
create table public.giveaway_tier_grants (
  id uuid primary key default gen_random_uuid(),
  giveaway_id uuid not null references public.giveaways(id) on delete cascade,
  source_tier_id uuid not null,
  ticket_tier_id uuid not null,
  quantity integer not null default 0 check (quantity >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id),
  constraint giveaway_tier_grants_pair unique (source_tier_id, ticket_tier_id),
  constraint giveaway_tier_grants_source_tier_fk
    foreign key (source_tier_id, giveaway_id)
    references public.giveaway_tiers(id, giveaway_id) on delete cascade,
  constraint giveaway_tier_grants_ticket_tier_fk
    foreign key (ticket_tier_id, giveaway_id)
    references public.giveaway_tiers(id, giveaway_id) on delete cascade
);

-- Keyword hints used to preselect a tier at donation intake. inventory_items.type
-- is free text with no controlled vocabulary (issue #667), so these only ever
-- suggest -- the staffer is holding the item and can always override, and the
-- resolved tier is stored on the grant row rather than re-derived later.
create table public.giveaway_tier_rules (
  id uuid primary key default gen_random_uuid(),
  giveaway_id uuid not null references public.giveaways(id) on delete cascade,
  tier_id uuid not null,
  match_text text not null check (length(btrim(match_text)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id),
  constraint giveaway_tier_rules_tier_fk
    foreign key (tier_id, giveaway_id)
    references public.giveaway_tiers(id, giveaway_id) on delete cascade
);

-- Price points for the sold-ticket path. A package grants bundle_quantity
-- copies of its tier's matrix row, which is how "2-3 price points, each
-- matching a tier and an amount of tickets" is expressed without a second
-- grant table.
create table public.giveaway_ticket_packages (
  id uuid primary key default gen_random_uuid(),
  giveaway_id uuid not null references public.giveaways(id) on delete cascade,
  name text not null,
  price numeric(10, 2) not null check (price >= 0),
  tier_id uuid not null,
  bundle_quantity integer not null default 1 check (bundle_quantity > 0),
  rank integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id),
  constraint giveaway_ticket_packages_id_giveaway unique (id, giveaway_id),
  constraint giveaway_ticket_packages_tier_fk
    foreign key (tier_id, giveaway_id)
    references public.giveaway_tiers(id, giveaway_id) on delete cascade
);

-- A record of money taken outside the system (cash, card reader). Payment
-- processing is explicitly out of scope for issue #5. unit_price is copied at
-- sale time so repricing a package later cannot rewrite past sales.
create table public.giveaway_ticket_sales (
  id uuid primary key default gen_random_uuid(),
  giveaway_id uuid not null references public.giveaways(id) on delete cascade,
  package_id uuid not null,
  purchaser_person_id uuid references public.people(id),
  quantity integer not null default 1 check (quantity > 0),
  unit_price numeric(10, 2) not null check (unit_price >= 0),
  amount numeric(10, 2) not null check (amount >= 0),
  sold_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id),
  constraint giveaway_ticket_sales_id_giveaway unique (id, giveaway_id),
  constraint giveaway_ticket_sales_package_fk
    foreign key (package_id, giveaway_id)
    references public.giveaway_ticket_packages(id, giveaway_id) on delete restrict
);

-- The shared ticket pool. Every issued ticket lands here, from either path, so
-- odds are a single sum(quantity) group by ticket_tier_id.
create table public.giveaway_ticket_grants (
  id uuid primary key default gen_random_uuid(),
  giveaway_id uuid not null references public.giveaways(id) on delete cascade,
  ticket_tier_id uuid not null,
  -- The tier the tickets were earned at: the donated item's tier, or the
  -- purchased package's tier. Distinct from ticket_tier_id, the colour.
  source_tier_id uuid not null,
  quantity integer not null check (quantity > 0),
  issued_at timestamptz not null default now(),
  donation_id uuid references public.donations(id) on delete cascade,
  inventory_item_id uuid references public.inventory_items(id) on delete cascade,
  sale_id uuid references public.giveaway_ticket_sales(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id),
  -- Exactly one source path, and the donated path always names its item.
  constraint giveaway_ticket_grants_one_source
    check (num_nonnulls(donation_id, sale_id) = 1),
  constraint giveaway_ticket_grants_donation_has_item
    check ((donation_id is null) = (inventory_item_id is null)),
  constraint giveaway_ticket_grants_ticket_tier_fk
    foreign key (ticket_tier_id, giveaway_id)
    references public.giveaway_tiers(id, giveaway_id) on delete cascade,
  constraint giveaway_ticket_grants_source_tier_fk
    foreign key (source_tier_id, giveaway_id)
    references public.giveaway_tiers(id, giveaway_id) on delete cascade
);

create index giveaway_ticket_grants_giveaway_tier_idx
  on public.giveaway_ticket_grants (giveaway_id, ticket_tier_id);
create index giveaway_ticket_grants_donation_idx
  on public.giveaway_ticket_grants (donation_id) where donation_id is not null;
create index giveaway_ticket_grants_sale_idx
  on public.giveaway_ticket_grants (sale_id) where sale_id is not null;

-- Draw containers. A bucket belongs to one ticket colour and carries 1..N
-- prizes, which covers both "one bucket per prize" and "one bucket, several
-- pulls" without a separate setting.
create table public.giveaway_buckets (
  id uuid primary key default gen_random_uuid(),
  giveaway_id uuid not null references public.giveaways(id) on delete cascade,
  tier_id uuid not null,
  name text not null,
  rank integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id),
  constraint giveaway_buckets_id_giveaway unique (id, giveaway_id),
  constraint giveaway_buckets_tier_fk
    foreign key (tier_id, giveaway_id)
    references public.giveaway_tiers(id, giveaway_id) on delete cascade
);

-- Additive, matching the shape of the source_inventory_item_id add in
-- 20260830170000: prizes with no bucket keep working unchanged.
alter table public.giveaway_prizes
  add column bucket_id uuid,
  add constraint giveaway_prizes_bucket_fk
    foreign key (bucket_id, giveaway_id)
    references public.giveaway_buckets(id, giveaway_id) on delete set null;

-- Same additive pattern as donor_person_id in 20260823070000 (issue #20):
-- winner_name stays, the people link is optional.
alter table public.giveaway_winners
  add column winner_person_id uuid references public.people(id);

create trigger set_updated_at before update on public.giveaway_tiers
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.giveaway_tier_grants
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.giveaway_tier_rules
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.giveaway_ticket_packages
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.giveaway_ticket_sales
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.giveaway_ticket_grants
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.giveaway_buckets
  for each row execute function public.set_updated_at();

alter table public.giveaway_tiers enable row level security;
alter table public.giveaway_tier_grants enable row level security;
alter table public.giveaway_tier_rules enable row level security;
alter table public.giveaway_ticket_packages enable row level security;
alter table public.giveaway_ticket_sales enable row level security;
alter table public.giveaway_ticket_grants enable row level security;
alter table public.giveaway_buckets enable row level security;

-- Same mapping the rest of the giveaway tables use (20260822100000):
-- select -> events:view, writes -> events:manage.
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'giveaway_tiers', 'giveaway_tier_grants', 'giveaway_tier_rules',
    'giveaway_ticket_packages', 'giveaway_ticket_sales',
    'giveaway_ticket_grants', 'giveaway_buckets'
  ]
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated
         using (public.has_permission(''events'', ''view''))',
      v_table || ' select', v_table
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated
         with check (public.has_permission(''events'', ''manage''))',
      v_table || ' insert', v_table
    );
    execute format(
      'create policy %I on public.%I for update to authenticated
         using (public.has_permission(''events'', ''manage''))
         with check (public.has_permission(''events'', ''manage''))',
      v_table || ' update', v_table
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated
         using (public.has_permission(''events'', ''manage''))',
      v_table || ' delete', v_table
    );
    execute format(
      'grant select, insert, update, delete on public.%I to authenticated', v_table
    );
  end loop;
end;
$$;

-- Audit coverage. Issue #5 closes the giveaway half of the gap named in
-- technical-spec §5.11: the three original tables were never audited, and a
-- ticket system that decides who wins gear is exactly the kind of surface that
-- needs a change history. One additive registry insert per table plus the
-- generic row trigger (20260828060000).
insert into public.audited_tables (table_name) values
  ('giveaways'),
  ('giveaway_prizes'),
  ('giveaway_winners'),
  ('giveaway_tiers'),
  ('giveaway_tier_grants'),
  ('giveaway_tier_rules'),
  ('giveaway_ticket_packages'),
  ('giveaway_ticket_sales'),
  ('giveaway_ticket_grants'),
  ('giveaway_buckets');

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'giveaways', 'giveaway_prizes', 'giveaway_winners',
    'giveaway_tiers', 'giveaway_tier_grants', 'giveaway_tier_rules',
    'giveaway_ticket_packages', 'giveaway_ticket_sales',
    'giveaway_ticket_grants', 'giveaway_buckets'
  ]
  loop
    execute format(
      'create trigger audit_log_row after insert or update or delete on public.%I
         for each row execute function public.audit_log_row()', v_table
    );
  end loop;
end;
$$;

-- Seeds the gold/silver/bronze defaults and the 3/1/1 . 1/3/2 . 0/1/3 matrix
-- from issue #5, plus starter keyword hints. Idempotent: a giveaway that
-- already has tiers is left alone, so calling this from the UI's "set up tiers"
-- action is safe to retry. Everything it writes is editable afterwards.
create or replace function public.seed_giveaway_tiers(p_giveaway_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gold uuid;
  v_silver uuid;
  v_bronze uuid;
begin
  if not public.has_permission('events', 'manage') then
    raise exception 'Not authorized to configure a giveaway';
  end if;

  if exists (select 1 from public.giveaway_tiers where giveaway_id = p_giveaway_id) then
    return;
  end if;

  insert into public.giveaway_tiers (giveaway_id, key, label, rank)
  values (p_giveaway_id, 'gold', 'Gold', 1) returning id into v_gold;
  insert into public.giveaway_tiers (giveaway_id, key, label, rank)
  values (p_giveaway_id, 'silver', 'Silver', 2) returning id into v_silver;
  insert into public.giveaway_tiers (giveaway_id, key, label, rank)
  values (p_giveaway_id, 'bronze', 'Bronze', 3) returning id into v_bronze;

  insert into public.giveaway_tier_grants
    (giveaway_id, source_tier_id, ticket_tier_id, quantity)
  values
    (p_giveaway_id, v_gold, v_gold, 3),
    (p_giveaway_id, v_gold, v_silver, 1),
    (p_giveaway_id, v_gold, v_bronze, 1),
    (p_giveaway_id, v_silver, v_gold, 1),
    (p_giveaway_id, v_silver, v_silver, 3),
    (p_giveaway_id, v_silver, v_bronze, 2),
    (p_giveaway_id, v_bronze, v_gold, 0),
    (p_giveaway_id, v_bronze, v_silver, 1),
    (p_giveaway_id, v_bronze, v_bronze, 3);

  insert into public.giveaway_tier_rules (giveaway_id, tier_id, match_text)
  select p_giveaway_id, v_gold, unnest(array['ski', 'snowboard', 'splitboard'])
  union all
  select p_giveaway_id, v_silver, unnest(array['jacket', 'pant', 'bib', 'outerwear', 'shell'])
  union all
  select p_giveaway_id, v_bronze, unnest(array['beanie', 'thermal', 'helmet cover', 'base layer']);
end;
$$;

revoke all on function public.seed_giveaway_tiers(uuid) from public;
grant execute on function public.seed_giveaway_tiers(uuid) to authenticated;
