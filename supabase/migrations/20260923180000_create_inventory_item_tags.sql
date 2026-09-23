-- Scannable inventory tags, part 1: the data model (#1420).
--
-- A gear item is identified at a handout by scanning something stuck to it --
-- a printed QR label, the manufacturer's barcode, or an NFC tag -- instead of
-- by typing or searching. This migration is only the table that says which
-- physical carrier belongs to which item. Label printing, the in-page scanner
-- and the event-distribution and intake flows are later parts of the same
-- ticket and read this table as it stands here.
--
-- Three kinds of tag, one table:
--
--   * asset_tag -- a short code the platform generates, e.g. 4F7K2Q. It is the
--     item's identity on paper: a QR label and an NFC sticker both encode the
--     same URL, https://<portal host>/portal/t/<code>, so a torn label is
--     replaced by printing the same code again, never by re-linking anything.
--     It is deliberately not the item's uuid (unreadable, and it would put a
--     primary key on every sticker) and deliberately not a SKU: an
--     inventory_items row is one piece, and a SKU names a kind of thing.
--     product_variants.sku (#907) is unrelated and stays so.
--   * barcode -- a manufacturer UPC/EAN read off the item as it arrived. One
--     code can sit on twenty identical pairs of gloves, so it is NOT unique
--     within a tenant; a scan that matches several items asks which one.
--   * nfc -- an NFC tag's own serial number, for a tag somebody stuck on before
--     writing our URL to it. Unique, like an asset tag: it is one chip.
--
-- The value is always what the scanner reads, trimmed. An asset-tag code is
-- stored upper case because the lookup normalizes to upper case; a barcode is
-- stored as read.

-- ---------------------------------------------------------------------------
-- 1. The table
-- ---------------------------------------------------------------------------

create table public.inventory_item_tags (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) default public.default_tenant_id(),
  -- Null only for an asset_tag, and only until it is bound (#1420, decided in
  -- this part): a sheet of labels can be printed before the donation they are
  -- for has arrived, and scanning one at intake sets this column instead of
  -- generating a code. A single table rather than a separate code pool, so a
  -- blank code and an assigned one answer to the same uniqueness rule and can
  -- never collide. Composite foreign key below; MATCH SIMPLE, so a null here is
  -- simply "no item yet".
  item_id uuid,
  kind text not null,
  -- Filled by set_inventory_item_tag_value() for an asset_tag inserted without
  -- one, which is how a code is created on demand.
  value text not null,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id),
  updated_at timestamptz not null default now(),
  -- set_updated_at() writes updated_by alongside updated_at.
  updated_by uuid references auth.users(id),
  unique (tenant_id, id),
  constraint inventory_item_tags_item_in_tenant
    foreign key (tenant_id, item_id)
    references public.inventory_items (tenant_id, id) on delete cascade,
  constraint inventory_item_tags_kind_check
    check (kind in ('asset_tag', 'barcode', 'nfc')),
  constraint inventory_item_tags_value_present
    check (btrim(value) <> '' and value = btrim(value)),
  constraint inventory_item_tags_asset_tag_upper
    check (kind <> 'asset_tag' or value = upper(value)),
  constraint inventory_item_tags_item_required
    check (item_id is not null or kind = 'asset_tag')
);

-- One chip, one item; one printed code, one item. A barcode is left out on
-- purpose (see above).
create unique index inventory_item_tags_unique_value
  on public.inventory_item_tags (tenant_id, kind, value)
  where kind in ('asset_tag', 'nfc');

-- One asset tag per item: "print the label again" has to mean the same code.
create unique index inventory_item_tags_one_asset_tag_per_item
  on public.inventory_item_tags (tenant_id, item_id)
  where kind = 'asset_tag' and item_id is not null;

-- The barcode lookup, which the partial unique index above does not cover.
create index inventory_item_tags_barcode_idx
  on public.inventory_item_tags (tenant_id, value)
  where kind = 'barcode';

create index inventory_item_tags_item_idx
  on public.inventory_item_tags (tenant_id, item_id);

create trigger set_updated_at before update on public.inventory_item_tags
  for each row execute function public.set_updated_at();

comment on table public.inventory_item_tags is
  'Physical carriers that identify an inventory item when scanned (#1420): a generated asset-tag code (printed as a QR label or written to an NFC tag as /portal/t/<code>), a manufacturer barcode (not unique -- one UPC can cover many pieces), or an NFC chip serial. An asset_tag with no item_id is a pre-printed blank waiting to be bound at intake.';

-- ---------------------------------------------------------------------------
-- 2. Asset-tag codes
-- ---------------------------------------------------------------------------

-- Six characters from an alphabet without the confusable 0/O and 1/I/L -- the
-- same alphabet generate_conduct_report_reference() uses, for the same reason:
-- a code read off a scuffed label or typed from one must not resolve to a
-- different item. 31^6 is about 887 million codes per tenant, so the loop below
-- all but never runs twice.
--
-- No prefix. The tenant comes from the request host, not from the code, so a
-- prefix would identify nothing; it would only make the QR denser.
--
-- Unique within a tenant rather than globally: a label is resolved on its own
-- organization's portal host and nowhere else.
create function public.generate_inventory_asset_tag(p_tenant_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
begin
  loop
    select string_agg(substr(v_chars, (ceil(random() * length(v_chars)))::int, 1), '')
    into v_code
    from generate_series(1, 6);

    exit when not exists (
      select 1 from public.inventory_item_tags
      where tenant_id = p_tenant_id and kind = 'asset_tag' and value = v_code
    );
  end loop;
  return v_code;
end;
$$;

comment on function public.generate_inventory_asset_tag(uuid) is
  'A fresh six-character asset-tag code for the tenant (#1420), from an alphabet without 0/O/1/I/L. Internal: called by the inventory_item_tags insert trigger.';

revoke execute on function public.generate_inventory_asset_tag(uuid) from public, anon, authenticated;

-- A trigger rather than a column default, because the default would have to
-- know the row's tenant. Creating a code on demand is therefore an ordinary
-- insert of `(item_id, kind) = (<item>, 'asset_tag')`, under the table's own
-- RLS, and a security definer RPC that needs one (intake, #1420 part 4) gets
-- it the same way.
create function public.set_inventory_item_tag_value()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.kind = 'asset_tag' then
    if new.value is null or btrim(new.value) = '' then
      new.value := public.generate_inventory_asset_tag(new.tenant_id);
    else
      new.value := upper(btrim(new.value));
    end if;
  elsif new.kind = 'nfc' and new.value is not null then
    -- Web NFC reports a serial in lower case ("04:a2:3b:..."); the lookup
    -- compares upper case.
    new.value := upper(btrim(new.value));
  elsif new.value is not null then
    new.value := btrim(new.value);
  end if;
  return new;
end;
$$;

revoke execute on function public.set_inventory_item_tag_value() from public, anon, authenticated;

create trigger set_inventory_item_tag_value
  before insert or update of kind, value on public.inventory_item_tags
  for each row execute function public.set_inventory_item_tag_value();

-- ---------------------------------------------------------------------------
-- 3. Row-level security
-- ---------------------------------------------------------------------------

-- The inventory resource and nothing new: a tag is part of the item it is
-- stuck to, and whoever may see the item may see its label. Writing one is
-- editing the item, so it is manage. Intake (inventory_intake) will tag the
-- items it receives from inside its own security definer RPC (#1420 part 4),
-- and does not need a policy here for that.
alter table public.inventory_item_tags enable row level security;

create policy "inventory_item_tags select" on public.inventory_item_tags
  for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('inventory', 'view')
  );
create policy "inventory_item_tags insert" on public.inventory_item_tags
  for insert to authenticated
  with check (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('inventory', 'manage')
  );
create policy "inventory_item_tags update" on public.inventory_item_tags
  for update to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('inventory', 'manage')
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('inventory', 'manage')
  );
create policy "inventory_item_tags delete" on public.inventory_item_tags
  for delete to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('inventory', 'manage')
  );

grant select, insert, update, delete on public.inventory_item_tags to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Audit
-- ---------------------------------------------------------------------------

-- Which code was on which item, and who moved a label from one to another, is
-- exactly what the trail is for when a handout record looks wrong. Nothing is
-- redacted: every column is an id, a kind or a machine-read code.
insert into public.audited_tables (table_name, pk_column, redacted_columns) values
  ('inventory_item_tags', 'id', '{}');

create trigger audit_log_row after insert or update or delete
  on public.inventory_item_tags
  for each row execute function public.audit_log_row();

-- ---------------------------------------------------------------------------
-- 5. Self-check
-- ---------------------------------------------------------------------------

-- Every policy on the new table carries the tenant predicate, and the foreign
-- key to its item is the composite one. tenant_isolation_gaps() asserts both
-- across the schema in the integration suite; this fails the migration itself
-- if either is missing here.
do $check$
declare
  v_policies text;
begin
  select string_agg(policyname, ', ') into v_policies
    from pg_policies
   where schemaname = 'public'
     and tablename = 'inventory_item_tags'
     and coalesce(qual, '') || coalesce(with_check, '') not like '%current_tenant_id()%';

  if v_policies is not null then
    raise exception 'inventory_item_tags policies without the tenant predicate: %', v_policies;
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.inventory_item_tags'::regclass
       and conname = 'inventory_item_tags_item_in_tenant'
       and array_length(conkey, 1) = 2
  ) then
    raise exception 'inventory_item_tags.item_id must reference inventory_items by (tenant_id, id)';
  end if;
end;
$check$;
