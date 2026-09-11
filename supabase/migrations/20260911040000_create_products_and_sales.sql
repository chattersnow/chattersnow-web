-- #907: the merchandise catalog and the sales ledger -- part 1 of the phase-1
-- point-of-sale module (Finance > Sales).
--
-- Four tables and one resource. This migration ships the schema and the
-- Products admin reads/writes it; part 2 adds the register and the record/void
-- RPCs, part 3 moves the finance rollup onto `sales` and retires the manual
-- `merchandise` source on `event_revenue`.
--
-- Three decisions are baked into the shape below.
--
-- **Merchandise gets its own catalog.** `inventory_items` is the gear library:
-- donation-managed, tracked per physical piece, and deliberately unpriced.
-- Merchandise is the opposite on all three counts -- bought in, counted by
-- variant, and sold at a price -- so overloading that table would mean a
-- nullable price, a nullable stock count and a `kind` discriminator on every
-- query the gear library runs. Two tables, instead.
--
-- **Phase 1 is record-only.** Payment is taken outside the system (cash, an
-- external card reader, Venmo); the portal records that a sale happened, what
-- was in it and how it was paid. That is the same policy
-- `giveaway_ticket_sales` already follows (spec §5.8), and it is why
-- `payment_method` reuses `monetary_donations.method`'s list verbatim rather
-- than inventing a processor vocabulary.
--
-- **Stock may only move through an RPC.** `sales` and `sale_line_items` get a
-- select policy and nothing else: no insert policy, no delete policy, and no
-- insert/delete grant. A sale decrements `product_variants.stock_on_hand`, and
-- a raw PostgREST insert into `sale_line_items` by any `sales:manage` holder
-- would write a line the stock never knew about. The part-2 RPCs
-- (`record_sale`, `void_sale`) are `security definer` and own that
-- transaction. The one write left open on the table itself is an update to
-- `sales`, limited by a column grant to the four fields that touch no money
-- and no stock -- the same precedent `artwork_submissions` sets for a table
-- whose inserts belong to an RPC.
--
-- Retention: `sales.purchaser_person_id` is deliberately **not** added to
-- `retention_purgeable_person_refs`, and `person_last_activity_at` is left
-- untouched. A purchase retains a person exactly the way a donation does --
-- there is a financial record naming them, and the person row has to outlive
-- the retention window for it to mean anything. There are no personal columns
-- here beyond that foreign key, so nothing else about a purchaser is stored to
-- purge.

-- Products --------------------------------------------------------------------

-- The sellable thing as a shopper names it ("Chatter Snow beanie"). Price and
-- stock live one level down, on the variant, because both differ by size.
create table public.products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) default public.default_tenant_id(),
  name text not null check (btrim(name) <> ''),
  description text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id),
  unique (tenant_id, name),
  -- Referenced by product_variants (tenant_id, product_id).
  unique (tenant_id, id)
);

comment on table public.products is
  'A sellable merchandise product (#907). Separate from inventory_items, which is the donation-managed, per-piece, unpriced gear library.';

create index products_tenant_id_idx on public.products (tenant_id);

create trigger set_updated_at before update on public.products
  for each row execute function public.set_updated_at();

alter table public.products enable row level security;

create policy "products select" on public.products for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('sales', 'view')
  );
create policy "products insert" on public.products for insert to authenticated
  with check (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('sales', 'manage')
  );
create policy "products update" on public.products for update to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('sales', 'manage')
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('sales', 'manage')
  );
create policy "products delete" on public.products for delete to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('sales', 'manage')
  );

grant select, insert, update, delete on public.products to authenticated;

-- Variants --------------------------------------------------------------------

-- What actually has a price and a stock count. A product with one size still
-- gets a variant ("One size") rather than a special case, so the register and
-- the line items only ever reference one kind of row.
create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) default public.default_tenant_id(),
  -- The foreign key is composite and declared below, with the rest of them.
  product_id uuid not null,
  label text not null check (btrim(label) <> ''),
  sku text,
  price numeric(10,2) not null check (price >= 0),
  stock_on_hand integer not null default 0 check (stock_on_hand >= 0),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id),
  unique (tenant_id, product_id, label),
  -- Referenced by sale_line_items (tenant_id, product_variant_id).
  unique (tenant_id, id),
  -- Composite, so a variant cannot be hung off another tenant's product.
  -- Cascade: a variant has no meaning apart from its product, and a product
  -- that has ever been sold cannot be deleted anyway (the restrict below).
  foreign key (tenant_id, product_id)
    references public.products (tenant_id, id) on delete cascade
);

comment on table public.product_variants is
  'One priced, stock-counted variant of a product (#907). stock_on_hand is only moved by the part-2 sale RPCs and by set_variant_stock from the Products admin.';

comment on column public.product_variants.stock_on_hand is
  'Units available. Never decremented by a direct table write: sales go through the part-2 record_sale/void_sale RPCs, which is why sale_line_items has no insert grant.';

create index product_variants_tenant_id_idx on public.product_variants (tenant_id);
create index product_variants_product_id_idx on public.product_variants (product_id);

-- Partial, because a SKU is optional and several variants may legitimately
-- have none. A plain unique would let exactly one of them be null-free.
create unique index product_variants_tenant_sku_idx
  on public.product_variants (tenant_id, sku) where sku is not null;

create trigger set_updated_at before update on public.product_variants
  for each row execute function public.set_updated_at();

alter table public.product_variants enable row level security;

create policy "product_variants select" on public.product_variants for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('sales', 'view')
  );
create policy "product_variants insert" on public.product_variants for insert to authenticated
  with check (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('sales', 'manage')
  );
create policy "product_variants update" on public.product_variants for update to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('sales', 'manage')
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('sales', 'manage')
  );
create policy "product_variants delete" on public.product_variants for delete to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('sales', 'manage')
  );

grant select, insert, update, delete on public.product_variants to authenticated;

-- Sales -----------------------------------------------------------------------

-- One transaction. Voided rather than deleted, so the ledger a rollup reads is
-- append-only in practice: the row stays, `status` says it does not count, and
-- who voided it and why stay attached.
create table public.sales (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) default public.default_tenant_id(),
  -- Both foreign keys are composite, nullable, and declared below.
  event_id uuid,
  purchaser_person_id uuid,
  sold_at timestamptz not null default now(),
  -- Verbatim the list on monetary_donations.method (20260829100000): the same
  -- money arriving by the same means, and a finance report that groups both
  -- would otherwise have to reconcile two vocabularies.
  payment_method text not null
    check (payment_method in ('cash', 'check', 'card', 'bank_transfer', 'online', 'other')),
  subtotal numeric(10,2) not null check (subtotal >= 0),
  discount_amount numeric(10,2) not null default 0 check (discount_amount >= 0),
  total numeric(10,2) not null check (total >= 0),
  -- text + check, never a Postgres enum -- the convention every status column
  -- in this schema follows.
  status text not null default 'completed'
    check (status in ('completed', 'voided')),
  voided_at timestamptz,
  voided_by uuid references auth.users(id),
  void_reason text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id),
  -- Referenced by sale_line_items (tenant_id, sale_id).
  unique (tenant_id, id),
  -- set null on the event column alone (Postgres 15+): the sale outlives a
  -- deleted event, and nulling tenant_id with it would violate not-null. The
  -- guard below means an event with sales cannot be deleted in the first
  -- place; this is what happens if one ever is, through a path the guard does
  -- not cover.
  foreign key (tenant_id, event_id)
    references public.events (tenant_id, id) on delete set null (event_id),
  foreign key (tenant_id, purchaser_person_id)
    references public.people (tenant_id, id) on delete set null (purchaser_person_id),
  constraint sales_total_is_subtotal_less_discount check (total = subtotal - discount_amount),
  constraint sales_discount_within_subtotal check (discount_amount <= subtotal),
  -- Voided and un-voided are one state, not two columns that can disagree.
  constraint sales_void_state check ((status = 'voided') = (voided_at is not null))
);

comment on table public.sales is
  'One point-of-sale transaction (#907). Record-only: payment is taken outside the system, same policy as giveaway_ticket_sales (spec §5.8). Written by the part-2 record_sale/void_sale RPCs -- there is no insert or delete grant here.';

create index sales_tenant_id_idx on public.sales (tenant_id);
-- (sold_at desc, id): the ledger's default order, with id breaking the tie so
-- a keyset page is stable across two sales recorded in the same second.
create index sales_sold_at_idx on public.sales (sold_at desc, id);
create index sales_event_id_idx on public.sales (event_id);
create index sales_purchaser_person_id_idx on public.sales (purchaser_person_id);
create index sales_status_idx on public.sales (status);

create trigger set_updated_at before update on public.sales
  for each row execute function public.set_updated_at();

alter table public.sales enable row level security;

create policy "sales select" on public.sales for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('sales', 'view')
  );

-- Update only, and only the four columns in the grant below. Money, stock and
-- void state are the RPCs' business; correcting which event a sale belongs to,
-- who bought it, or what the note says is not.
create policy "sales update" on public.sales for update to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('sales', 'manage')
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('sales', 'manage')
  );

-- No insert or delete policy, and no insert or delete grant, on purpose. See
-- the header.
--
-- The revoke is the part that does the work, and it is not optional: Supabase
-- ships `alter default privileges in schema public grant all on tables to
-- postgres, anon, authenticated, service_role`, so a table created here starts
-- with every privilege already handed to both client roles. Omitting a grant
-- grants nothing back -- it simply leaves the default in place. RLS would
-- still refuse the write (no insert policy means default-deny), but then the
-- only thing standing between a `sales:manage` holder and a hand-written
-- PostgREST insert would be a policy, with the grant layer saying yes. The
-- same reasoning as 20260908000000's revoke on site_content and
-- 20260910010000's on resources.
--
-- `anon` is revoked too. It has no policy here either, so this changes no
-- outcome today; it means a later migration that adds an anon-facing policy to
-- a neighbouring table cannot widen this one by accident.
revoke all on public.sales from authenticated, anon;
grant select on public.sales to authenticated;
-- Column-level, so the four fields that touch neither money nor stock are
-- correctable in place while the rest of the row stays the RPCs' business.
grant update (event_id, purchaser_person_id, notes, updated_by) on public.sales to authenticated;

-- Line items ------------------------------------------------------------------

-- description and unit_price are snapshots, not lookups. Renaming a product or
-- repricing a variant next season must not rewrite what a receipt from last
-- season says was sold and for how much.
create table public.sale_line_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) default public.default_tenant_id(),
  -- Both foreign keys are composite and declared below.
  sale_id uuid not null,
  product_variant_id uuid not null,
  description text not null check (btrim(description) <> ''),
  unit_price numeric(10,2) not null check (unit_price >= 0),
  quantity integer not null check (quantity > 0),
  line_total numeric(10,2) not null check (line_total >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id),
  -- One line per variant per sale: two of the same beanie is quantity 2, not
  -- two lines, so a void can return stock by reading the lines once.
  unique (sale_id, product_variant_id),
  unique (tenant_id, id),
  foreign key (tenant_id, sale_id)
    references public.sales (tenant_id, id) on delete cascade,
  -- restrict, not cascade: a variant that has ever been sold cannot be
  -- deleted, only deactivated. Deleting it would destroy the priced history
  -- the rollup reads.
  foreign key (tenant_id, product_variant_id)
    references public.product_variants (tenant_id, id) on delete restrict,
  constraint sale_line_items_total_is_price_times_quantity
    check (line_total = unit_price * quantity)
);

comment on table public.sale_line_items is
  'What was in a sale, priced as it was on the day (#907). Written only by the part-2 record_sale RPC; no insert, update or delete grant exists here.';

create index sale_line_items_tenant_id_idx on public.sale_line_items (tenant_id);
create index sale_line_items_sale_id_idx on public.sale_line_items (sale_id);
create index sale_line_items_product_variant_id_idx on public.sale_line_items (product_variant_id);

create trigger set_updated_at before update on public.sale_line_items
  for each row execute function public.set_updated_at();

alter table public.sale_line_items enable row level security;

create policy "sale_line_items select" on public.sale_line_items for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('sales', 'view')
  );

-- Read-only through the API, entirely. Even the narrow update `sales` gets is
-- withheld here: every column on this table is either money or the identity of
-- the thing whose stock moved. Revoked first for the reason given above --
-- Supabase's default privileges have already granted all of this.
revoke all on public.sale_line_items from authenticated, anon;
grant select on public.sale_line_items to authenticated;

-- Permissions -----------------------------------------------------------------

-- sort_order 74 sits between `finance` (70) and `finance_reports` (80), which
-- is where Sales sits in the section too. module_key is named explicitly:
-- 20260910010000 made resources.module_key not null, and a resource added
-- after it without one fails the insert rather than the build.
insert into public.resources (key, section, label, description, sort_order, module_key) values
  ('sales', 'Finance', 'Sales', 'The merchandise catalog, the point-of-sale register, and the sales ledger', 74, 'finance');

-- Every tenant's roles, not just the template's: roles are per tenant since
-- Phase 2 and the join by name reaches all of them. board and volunteer get no
-- row, which is how `none` is expressed -- board sees finance through reports
-- only, and a volunteer working a merchandise table is out of scope for
-- phase 1.
insert into public.role_permissions (role_id, resource_id, level)
select r.id, res.id, v.level
from (values
  ('admin', 'sales', 'manage'),
  ('finance', 'sales', 'manage'),
  ('event_coordinator', 'sales', 'manage')
) as v(role_name, resource_key, level)
join public.roles r on r.name = v.role_name
join public.resources res on res.key = v.resource_key;

-- Audit -------------------------------------------------------------------------

-- All four, with nothing redacted. The catalog is organizational data, and a
-- sale's only personal column is a foreign key to `people` -- the row it points
-- at carries the person's details and has its own retention rule. Prices,
-- quantities and voids are exactly the material §5.11 means by "income".
insert into public.audited_tables (table_name) values
  ('products'),
  ('product_variants'),
  ('sales'),
  ('sale_line_items');

create trigger audit_log_row after insert or update or delete on public.products
  for each row execute function public.audit_log_row();
create trigger audit_log_row after insert or update or delete on public.product_variants
  for each row execute function public.audit_log_row();
create trigger audit_log_row after insert or update or delete on public.sales
  for each row execute function public.audit_log_row();
create trigger audit_log_row after insert or update or delete on public.sale_line_items
  for each row execute function public.audit_log_row();

-- Event delete guard --------------------------------------------------------------

-- `sales.event_id` is `on delete set null`, so without this an event with a
-- day's takings against it could be deleted and the sales would survive
-- orphaned, out of every event-scoped rollup, exactly the failure
-- 20260903060000 exists to prevent.
--
-- The body below is **20260904010000's**, not 20260903060000's, with one row
-- added. The original listed `event_volunteer_hours`, a table that migration
-- folded into `volunteer_hours` and dropped; replacing the function from the
-- older source reintroduces a `select count(*) from public.event_volunteer_hours`
-- that does not fail here -- the function is only `execute format`ed at delete
-- time -- but raises `relation does not exist` on the next attempt to delete
-- any event. Take the body from whichever migration last defined it.
create or replace function public.event_linked_record_labels(p_id uuid)
returns text[]
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_labels text[] := '{}';
  v_count bigint;
  v_rel record;
begin
  for v_rel in
    select * from (values
      -- on delete cascade: these rows would be destroyed with the event
      ('event_registrations',   'registrant',                 'registrants'),
      ('event_sponsors',        'sponsor',                    'sponsors'),
      ('event_staff',           'staff assignment',           'staff assignments'),
      ('event_volunteers',      'volunteer signup',           'volunteer signups'),
      ('event_shifts',          'shift',                      'shifts'),
      ('event_incidents',       'incident',                   'incidents'),
      ('discount_codes',        'discount code',              'discount codes'),
      ('giveaways',             'giveaway',                   'giveaways'),
      -- on delete set null: these rows would survive, orphaned
      ('donations',             'linked donation',            'linked donations'),
      ('monetary_donations',    'linked monetary donation',   'linked monetary donations'),
      ('inventory_movements',   'linked inventory movement',  'linked inventory movements'),
      ('event_expenses',        'linked expense',             'linked expenses'),
      ('event_revenue',         'linked revenue entry',       'linked revenue entries'),
      ('reimbursements',        'linked reimbursement',       'linked reimbursements'),
      ('volunteer_hours',       'linked volunteer hours entry', 'linked volunteer hours entries'),
      ('sales',                 'linked sale',                'linked sales')
    ) as t(table_name, singular, plural)
  loop
    -- %I over a literal from the list above, so there's no injection surface.
    execute format('select count(*) from public.%I where event_id = $1', v_rel.table_name)
      into v_count using p_id;

    if v_count > 0 then
      v_labels := v_labels || format(
        '%s %s',
        v_count,
        case when v_count = 1 then v_rel.singular else v_rel.plural end
      );
    end if;
  end loop;

  return v_labels;
end;
$$;

-- create or replace does not reset grants, but state them again rather than
-- rely on that: internal, read by the trigger and by event_delete_blockers().
revoke all on function public.event_linked_record_labels(uuid) from public;

-- Prove every table in that registry exists, now, rather than the next time
-- somebody deletes an event. The names are reached through `execute format`,
-- so PL/pgSQL resolves none of them at definition time and a stale entry sits
-- silent until it raises in front of a user. One call against an id that
-- matches nothing runs every count in the list for the price of fifteen index
-- probes.
do $$
begin
  perform public.event_linked_record_labels(gen_random_uuid());
exception when others then
  raise exception 'event_linked_record_labels names a table that does not exist: %', sqlerrm;
end $$;

-- Self-check, the same one 20260906130000 and 20260909040000 run: none of the
-- four new tables may have opened an isolation gap.
do $$
declare
  v_gaps text;
begin
  select string_agg(p.tablename || '."' || p.policyname || '"', ', ') into v_gaps
  from pg_policies p
  where p.schemaname = 'public'
    and p.tablename in ('products', 'product_variants', 'sales', 'sale_line_items')
    and coalesce(p.qual, '') !~ 'tenant_id'
    and coalesce(p.with_check, '') !~ 'tenant_id';
  if v_gaps is not null then
    raise exception 'Sales policies without a tenant predicate: %', v_gaps;
  end if;
end $$;

-- And the second invariant this migration asserts, checked rather than
-- assumed: nothing that could write a sale or a line item outside the part-2
-- RPCs survives. Column-level grants show up in information_schema as one row
-- per column, so `update` on `sales` is expected and `insert`/`delete` are not.
do $$
declare
  v_extra text;
begin
  select string_agg(distinct format('%s.%s to %s', table_name, privilege_type, grantee), ', ')
    into v_extra
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name in ('sales', 'sale_line_items')
    and grantee in ('authenticated', 'anon')
    and not (table_name = 'sales' and grantee = 'authenticated'
             and privilege_type in ('SELECT', 'UPDATE'))
    and not (table_name = 'sale_line_items' and grantee = 'authenticated'
             and privilege_type = 'SELECT');
  if v_extra is not null then
    raise exception 'Sales tables carry write grants they should not: %', v_extra;
  end if;
end $$;
