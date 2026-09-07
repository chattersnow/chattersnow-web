-- Issue #667. inventory_items.type has been plain `text not null` since
-- 20260819000000 with no constraint and a bare <Input> behind it, so
-- "Snowboard", "snowboard", "Snow board" and "board" are four different
-- categories. Everything that keys off an item's category is unreliable as a
-- result: the portal items filter builds its dropdown by scanning every `type`
-- value and de-duping (one option per spelling variant), the public gear
-- catalog does the same client-side, the valuation report (spec §5.19) shows
-- one real category as several rows, and issue #5's giveaway tiers had to ship
-- a per-giveaway keyword map that only *suggests* a tier -- the comment on
-- giveaway_tier_rules (20260904100000) names this issue as the reason.
--
-- Two tables rather than one self-referencing table: the vocabulary is
-- deliberately two levels (group -> category, e.g. Outerwear -> Jacket), and a
-- parent_id would need a trigger to stop a third level appearing. Structure
-- enforces the depth for free and inventory_items gets one unambiguous FK to a
-- leaf.
--
-- Unlike volunteer_role_types and programs -- admin-managed lookups that
-- deliberately ship empty because their contents are an org decision -- this
-- one seeds a starter vocabulary in the migration. The backfill below needs
-- targets to map the existing free text onto, and an empty vocabulary would
-- mean every existing item lands uncategorized on day one. Everything seeded
-- here is editable at /portal/inventory/categories afterwards.
--
-- Nothing is destructive: inventory_items.type is never rewritten. It keeps
-- whatever a staffer typed, and gains a second job as the free-text detail for
-- the "Other" category.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- created_by is nullable (unlike volunteer_role_types, where it defaults to
-- auth.uid() and is not null) because the seed rows below are inserted by the
-- migration itself, where there is no authenticated user.
create table public.inventory_category_groups (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id)
);

comment on table public.inventory_category_groups is
  'Top level of the inventory category vocabulary (issue #667), e.g. Outerwear. Groups exist for display grouping and rollup reporting; items are always tagged with a leaf inventory_categories row, never a group.';

create table public.inventory_categories (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.inventory_category_groups(id) on delete restrict,
  key text not null unique,
  label text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id)
);

comment on table public.inventory_categories is
  'Leaf level of the inventory category vocabulary (issue #667), e.g. Jacket. inventory_items.category_id points here. on delete restrict on group_id so a group cannot be removed out from under its categories.';

create index inventory_categories_group_id_idx on public.inventory_categories (group_id);

create trigger set_updated_at before update on public.inventory_category_groups
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.inventory_categories
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Starter vocabulary
-- ---------------------------------------------------------------------------

-- Naming here is coupled to issue #5's tier keywords until the follow-up
-- ticket replaces them with a direct category -> tier mapping, because
-- suggest_giveaway_tier substring-matches a rule against
-- "<group label> <category label> <detail>" (see the intake RPC below).
-- Two consequences a future admin renaming a category needs to know:
--
--   * The group is "Hardgoods", not "Boards & skis". 'ski' is a gold keyword
--     and is a substring of "skis" -- so a group named "Boards & skis" would
--     suggest gold tickets for a $15 pair of poles.
--   * Footwear is one "Boots" category rather than separate ski/snowboard
--     boots, for the same reason: "Snowboard boots" contains 'snowboard' and
--     would suggest gold. Size and description carry the distinction instead.
--
-- Getting this wrong is not silent-but-harmless: the suggestion is
-- overridable, but a wrong suggestion is worse than the no-match the staffer
-- gets today, which prompts them to classify the item deliberately.
insert into public.inventory_category_groups (key, label, sort_order) values
  ('hardgoods',    'Hardgoods',   10),
  ('outerwear',    'Outerwear',   20),
  ('layers',       'Layers',      30),
  ('footwear',     'Footwear',    40),
  ('protection',   'Protection',  50),
  ('accessories',  'Accessories', 60),
  ('non_gear',     'Non-gear',    70),
  ('other',        'Other',       80);

insert into public.inventory_categories (group_id, key, label, sort_order)
select g.id, v.key, v.label, v.sort_order
from (values
  ('hardgoods',   'snowboard',    'Snowboard',          10),
  ('hardgoods',   'skis',         'Skis',               20),
  ('hardgoods',   'splitboard',   'Splitboard',         30),
  ('hardgoods',   'poles',        'Poles',              40),
  ('hardgoods',   'bindings',     'Bindings',           50),
  ('outerwear',   'jacket',       'Jacket',             10),
  ('outerwear',   'pants',        'Pants / bibs',       20),
  ('outerwear',   'snowsuit',     'Snowsuit',           30),
  ('outerwear',   'shell',        'Shell',              40),
  ('layers',      'base_layer',   'Base layer',         10),
  ('layers',      'mid_layer',    'Mid layer / fleece', 20),
  ('layers',      'thermals',     'Thermals',           30),
  ('footwear',    'boots',        'Boots',              10),
  ('protection',  'helmet',       'Helmet',             10),
  ('protection',  'wrist_guards', 'Wrist guards',       20),
  ('protection',  'pads',         'Pads',               30),
  ('accessories', 'beanie',       'Beanie',             10),
  ('accessories', 'gloves',       'Gloves / mittens',   20),
  ('accessories', 'goggles',      'Goggles',            30),
  ('accessories', 'neck_gaiter',  'Neck gaiter',        40),
  ('accessories', 'socks',        'Socks',              50),
  ('accessories', 'helmet_cover', 'Helmet cover',       60),
  ('accessories', 'backpack',     'Backpack',           70),
  ('non_gear',    'voucher',      'Voucher / gift card', 10),
  ('non_gear',    'lift_ticket',  'Lift ticket',        20),
  ('non_gear',    'rental',       'Equipment rental',   30),
  ('other',       'other',        'Other',              10)
) as v(group_key, key, label, sort_order)
join public.inventory_category_groups g on g.key = v.group_key;

-- ---------------------------------------------------------------------------
-- Free text -> category resolution
-- ---------------------------------------------------------------------------

-- One place that knows how to turn a free-text item type into a category, used
-- by three callers that would otherwise each need their own copy: the backfill
-- below, the before-insert trigger that covers write paths still passing only
-- `type`, and donation intake. Matching is exact-after-normalization (key,
-- label, or a known alias) -- never a substring, so "ski" can't swallow
-- "ski boots".
--
-- The alias list is seeded from the spellings the seed data and the intake
-- forms have historically produced. It is intentionally inline rather than a
-- fourth table: an unmatched value is not an error, it just leaves the item
-- uncategorized for a staffer to fix, so there is no need for admins to extend
-- this at runtime.
create or replace function public.resolve_inventory_category(p_text text)
returns uuid
language sql
stable
set search_path = public
as $$
  with term as (
    select nullif(lower(btrim(coalesce(p_text, ''))), '') as value
  ),
  alias as (
    select * from (values
      ('snow board', 'snowboard'), ('board', 'snowboard'), ('snowboards', 'snowboard'),
      ('split board', 'splitboard'),
      ('ski', 'skis'), ('skies', 'skis'),
      ('ski poles', 'poles'), ('pole', 'poles'),
      ('binding', 'bindings'),
      ('coat', 'jacket'), ('jackets', 'jacket'), ('winter jacket', 'jacket'),
      ('insulated jacket', 'jacket'), ('parka', 'jacket'),
      ('pant', 'pants'), ('snow pants', 'pants'), ('snowpants', 'pants'),
      ('ski pants', 'pants'), ('bib', 'pants'), ('bibs', 'pants'),
      ('snow suit', 'snowsuit'), ('one piece', 'snowsuit'),
      ('shell jacket', 'shell'),
      ('baselayer', 'base_layer'), ('long johns', 'base_layer'),
      ('fleece', 'mid_layer'), ('pullover', 'mid_layer'), ('midlayer', 'mid_layer'),
      ('mid layer', 'mid_layer'), ('sweater', 'mid_layer'),
      ('thermal', 'thermals'),
      ('boot', 'boots'), ('snowboots', 'boots'), ('snow boots', 'boots'),
      ('winter boots', 'boots'), ('snowboard boots', 'boots'),
      ('snowboard boot', 'boots'), ('ski boots', 'boots'), ('ski boot', 'boots'),
      ('helmets', 'helmet'),
      ('pack', 'backpack'), ('daypack', 'backpack'), ('bag', 'backpack'),
      ('gift card', 'voucher'), ('giftcard', 'voucher'), ('vouchers', 'voucher'),
      ('lift pass', 'lift_ticket'), ('day pass', 'lift_ticket'),
      ('rentals', 'rental'),
      ('wrist guard', 'wrist_guards'),
      ('pad', 'pads'), ('knee pads', 'pads'),
      ('beanies', 'beanie'), ('hat', 'beanie'), ('toque', 'beanie'),
      ('glove', 'gloves'), ('mitten', 'gloves'), ('mittens', 'gloves'),
      ('goggle', 'goggles'),
      ('gaiter', 'neck_gaiter'), ('neck warmer', 'neck_gaiter'),
      ('buff', 'neck_gaiter'), ('scarf', 'neck_gaiter'),
      ('sock', 'socks'),
      ('accessory', 'other'), ('accessories', 'other'), ('misc', 'other'),
      ('gear', 'other')
    ) as a(term, category_key)
  )
  select c.id
  from public.inventory_categories c
  where c.is_active
    and (
      c.key = (select value from term)
      or lower(c.label) = (select value from term)
      or c.key = (
        select a.category_key from alias a where a.term = (select value from term)
      )
    )
  limit 1;
$$;

revoke all on function public.resolve_inventory_category(text) from public;
grant execute on function public.resolve_inventory_category(text) to authenticated;

-- ---------------------------------------------------------------------------
-- inventory_items
-- ---------------------------------------------------------------------------

-- Nullable: legacy rows whose free text matches nothing must not block this
-- migration, and they surface as "Uncategorized" in the items list so staff can
-- classify them by hand.
-- on delete restrict so an admin cannot silently orphan items by deleting a
-- category that is still in use; the admin screen maps the FK violation to
-- "retire it instead", and is_active is the intended way to withdraw a
-- category from the pickers without touching history.
alter table public.inventory_items
  add column category_id uuid references public.inventory_categories(id) on delete restrict;

create index inventory_items_category_id_idx on public.inventory_items (category_id);

comment on column public.inventory_items.category_id is
  'Controlled category (issue #667). Null means uncategorized -- a legacy row whose free-text type matched no category.';

-- `type` stops being the category and keeps two jobs: it preserves whatever a
-- staffer typed before the vocabulary existed, and it carries the free-text
-- detail when the chosen category is "Other". Dropping not null lets an item
-- carry a category with no extra detail.
alter table public.inventory_items alter column type drop not null;

comment on column public.inventory_items.type is
  'Legacy free-text item type, superseded as the category by category_id (issue #667). Retained so nothing entered before the vocabulary existed is lost, and reused as the free-text detail for the "Other" category.';

-- Backstop for every write path that still supplies only `type` --
-- sync_event_sponsor_donations (which hardcodes ''other''), and any future
-- caller. An explicit category_id always wins, so the "Other" + detail case is
-- never silently reclassified.
create or replace function public.set_inventory_item_category()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.category_id is null then
    new.category_id := public.resolve_inventory_category(new.type);
  end if;
  return new;
end;
$$;

create trigger set_inventory_item_category
  before insert on public.inventory_items
  for each row execute function public.set_inventory_item_category();

-- Backfill. Non-destructive: only category_id is written, `type` is untouched.
update public.inventory_items
set category_id = public.resolve_inventory_category(type)
where category_id is null;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.inventory_category_groups enable row level security;
alter table public.inventory_categories enable row level security;

-- Reuses the existing `inventory` resource rather than introducing a new one.
-- Select is open to any signed-in user, the same shape roles/resources use:
-- intake volunteers (inventory_intake), reports-only roles (inventory_reports)
-- and managers all need to render the vocabulary, and a category label is not
-- sensitive. Editing the vocabulary is inventory:manage.
create policy "inventory_category_groups select" on public.inventory_category_groups for select to authenticated
  using (true);
create policy "inventory_category_groups insert" on public.inventory_category_groups for insert to authenticated
  with check (public.has_permission('inventory', 'manage'));
create policy "inventory_category_groups update" on public.inventory_category_groups for update to authenticated
  using (public.has_permission('inventory', 'manage')) with check (public.has_permission('inventory', 'manage'));
create policy "inventory_category_groups delete" on public.inventory_category_groups for delete to authenticated
  using (public.has_permission('inventory', 'manage'));

create policy "inventory_categories select" on public.inventory_categories for select to authenticated
  using (true);
create policy "inventory_categories insert" on public.inventory_categories for insert to authenticated
  with check (public.has_permission('inventory', 'manage'));
create policy "inventory_categories update" on public.inventory_categories for update to authenticated
  using (public.has_permission('inventory', 'manage')) with check (public.has_permission('inventory', 'manage'));
create policy "inventory_categories delete" on public.inventory_categories for delete to authenticated
  using (public.has_permission('inventory', 'manage'));

grant select, insert, update, delete on public.inventory_category_groups to authenticated;
grant select, insert, update, delete on public.inventory_categories to authenticated;

-- Editing the vocabulary reshapes every category-keyed report, so it belongs in
-- the audit trail alongside app_settings.
insert into public.audited_tables (table_name) values
  ('inventory_category_groups'),
  ('inventory_categories');

create trigger audit_log_row after insert or update or delete on public.inventory_category_groups
  for each row execute function public.audit_log_row();
create trigger audit_log_row after insert or update or delete on public.inventory_categories
  for each row execute function public.audit_log_row();

-- ---------------------------------------------------------------------------
-- Staff read model
-- ---------------------------------------------------------------------------

-- The items list is server-sorted and server-paginated, and "Type" is one of
-- its sortable columns (inventory-shared.tsx SORT_COLUMNS). PostgREST cannot
-- order a parent row by a column of a to-one embedded resource, and ordering
-- by category_id would sort by a random uuid -- so the sort key has to be a
-- real column on whatever the page selects from. Hence a view rather than an
-- embed.
--
-- security_invoker so the "inventory_items select" policy still decides which
-- rows a caller sees (same reasoning as people_with_roles, 20260903030000).
-- LEFT joins throughout: an inner join would make uncategorized stock vanish
-- from the staff list, which is exactly the stock that needs attention.
--
-- `ii.*` is expanded at creation time, so adding a column to inventory_items
-- later means recreating this view in that migration.
create view public.inventory_items_with_category
with (security_invoker = true) as
select
  ii.*,
  c.key as category_key,
  c.label as category_label,
  c.is_active as category_is_active,
  g.key as category_group_key,
  g.label as category_group_label,
  -- Zero-padded so it sorts as text in the same order the two integers would
  -- sort numerically, and so uncategorized rows sort last under an ascending
  -- sort rather than first (nulls would).
  coalesce(
    lpad(g.sort_order::text, 6, '0') || '.' || lpad(c.sort_order::text, 6, '0'),
    'zzzzzz'
  ) as category_sort_key
from public.inventory_items ii
left join public.inventory_categories c on c.id = ii.category_id
left join public.inventory_category_groups g on g.id = c.group_id;

grant select on public.inventory_items_with_category to authenticated;

-- ---------------------------------------------------------------------------
-- Public gear catalog
-- ---------------------------------------------------------------------------

-- Columns appended (create or replace only tolerates appends), so the anon
-- grant survives. The view carries the labels itself, which is why anon needs
-- no access to the vocabulary tables. `type` stays as the fallback for a
-- legacy row that never got categorized.
create or replace view public.public_gear_catalog as
select
  ii.id,
  ii.description,
  ii.size,
  ii.type,
  ii.gender,
  ii.condition,
  ii.photo_url,
  ii.created_at,
  c.key as category_key,
  c.label as category_label,
  g.key as category_group_key,
  g.label as category_group_label,
  c.sort_order as category_sort_order,
  g.sort_order as category_group_sort_order
from public.inventory_items ii
left join public.inventory_categories c on c.id = ii.category_id
left join public.inventory_category_groups g on g.id = c.group_id
where ii.status = 'available'
  and ii.intended_use = 'gear_library';

-- ---------------------------------------------------------------------------
-- Donation intake
-- ---------------------------------------------------------------------------

-- Replaces the version in 20260904110000. Two changes: p_items entries may now
-- carry `category_key`, and the giveaway tier matcher is fed the category's
-- group and label alongside the free text instead of the free text alone.
--
-- suggest_giveaway_tier (issue #5) is a case-insensitive substring match of a
-- tier's keyword against whatever text it is handed, so passing
-- "Outerwear Jacket <detail>" keeps every existing rule working -- 'jacket'
-- and 'pant' still match, and a group-level keyword like 'outerwear' now
-- matches too. Rewriting those rules into a direct category -> tier mapping is
-- deliberately left as a follow-up; nothing here depends on it.
create or replace function public.create_donation_with_items(
  p_donor_name text,
  p_donor_is_anonymous boolean,
  p_donor_source_type text,
  p_donor_email text,
  p_donor_phone text,
  p_donor_notes text,
  p_items jsonb,
  p_event_id uuid default null
) returns table(
  donation_id uuid,
  inventory_item_ids uuid[],
  giveaway_id uuid,
  untiered_item_ids uuid[]
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_donor_id uuid;
  v_donation_id uuid;
  v_item_id uuid;
  v_item jsonb;
  v_item_ids uuid[] := '{}';
  v_giveaway_id uuid;
  v_tier_id uuid;
  v_tier_key text;
  v_untiered uuid[] := '{}';
  v_category_id uuid;
  v_tier_text text;
begin
  if not (public.has_permission('finance', 'manage') or public.has_permission('inventory_intake', 'manage')) then
    raise exception 'Not authorized to record a donation';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 then
    raise exception 'At least one item is required';
  end if;

  if p_donor_is_anonymous or p_donor_email is null or p_donor_email = '' then
    insert into public.people (name, is_anonymous, source_type, email, phone, notes)
    values (p_donor_name, p_donor_is_anonymous, p_donor_source_type, p_donor_email, p_donor_phone, p_donor_notes)
    returning id into v_donor_id;
  else
    v_donor_id := public.resolve_or_create_person_by_email(
      p_donor_name, p_donor_email, p_donor_phone, p_donor_notes, p_donor_source_type, null
    );
  end if;

  insert into public.donations (donor_id, event_id)
  values (v_donor_id, p_event_id)
  returning id into v_donation_id;

  -- Only a giveaway that has actually been set up with tiers grants tickets.
  -- A legacy flat giveaway (no tier rows) is left alone.
  if p_event_id is not null then
    select g.id into v_giveaway_id
    from public.giveaways g
    where g.event_id = p_event_id
      and exists (select 1 from public.giveaway_tiers t where t.giveaway_id = g.id);
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    -- An explicit category wins; otherwise fall back to reading the free text,
    -- so a caller that has not been updated yet still lands somewhere sensible.
    v_category_id := null;
    if nullif(v_item->>'category_key', '') is not null then
      select c.id into v_category_id
      from public.inventory_categories c
      where c.key = v_item->>'category_key';
    end if;
    if v_category_id is null then
      v_category_id := public.resolve_inventory_category(v_item->>'type');
    end if;

    insert into public.inventory_items
      (donation_id, description, size, type, gender, condition, face_value, notes, intended_use, category_id)
    values (
      v_donation_id,
      v_item->>'description',
      v_item->>'size',
      v_item->>'type',
      v_item->>'gender',
      v_item->>'condition',
      nullif(v_item->>'face_value', '')::numeric,
      v_item->>'notes',
      coalesce(nullif(v_item->>'intended_use', ''), 'gear_library'),
      v_category_id
    )
    returning id into v_item_id;

    v_item_ids := array_append(v_item_ids, v_item_id);

    insert into public.inventory_movements (inventory_item_id, movement_type, quantity, reason)
    values (v_item_id, 'received', 1, 'Donation intake');

    if v_giveaway_id is not null then
      v_tier_id := null;
      v_tier_key := nullif(v_item->>'giveaway_tier', '');

      if v_tier_key is not null then
        select t.id into v_tier_id
        from public.giveaway_tiers t
        where t.giveaway_id = v_giveaway_id and t.key = v_tier_key;
      end if;

      if v_tier_id is null then
        select concat_ws(' ', g.label, c.label, v_item->>'type')
        into v_tier_text
        from public.inventory_categories c
        join public.inventory_category_groups g on g.id = c.group_id
        where c.id = v_category_id;

        v_tier_id := public.suggest_giveaway_tier(
          v_giveaway_id, coalesce(v_tier_text, v_item->>'type')
        );
      end if;

      if v_tier_id is null then
        v_untiered := array_append(v_untiered, v_item_id);
      else
        -- Every donated item grants its own bundle, uncapped (issue #5).
        perform public.grant_giveaway_tickets(
          v_giveaway_id, v_tier_id, 1, v_donation_id, v_item_id, null
        );
      end if;
    end if;
  end loop;

  return query select v_donation_id, v_item_ids, v_giveaway_id, v_untiered;
end;
$$;
