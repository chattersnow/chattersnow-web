-- Reusable numbered tag codes (#1444).
--
-- Every asset-tag code so far is a random six-character value made for one
-- item, and it stays on that item for good. An NFC tag stuck on a helmet that
-- has been handed out is therefore a dead tag. This adds a second kind of
-- code: a numbered slot that is printed and written once and then reused.
--
--   * The code is `<PREFIX>-<NNN>`, e.g. CSN-007. The prefix is three letters
--     chosen per tenant, and the number is padded to three digits and keeps
--     counting past 999 (CSN-1000). The hyphen is not in the random-code
--     alphabet, so a code with one is always numbered and one without is
--     always random; nothing else has to tell them apart.
--   * A numbered code points at whatever item holds it now, or at nothing.
--     Binding one is always a person's choice -- the tag in their hand -- and
--     never the system's. Unbinding is automatic: an item that is distributed,
--     retired or lost gives its code back in the same transaction.
--   * Every binding is kept in inventory_item_tag_assignments, so an item's
--     history still says it held CSN-007 after the code has moved on.
--     audit_log can't serve that: inventory readers can't read it.
--
-- The tenant still comes from the request host, as it does for random codes;
-- the prefix is for the people reading the label.

-- ---------------------------------------------------------------------------
-- 1. The tenant's prefix
-- ---------------------------------------------------------------------------

alter table public.tenants
  add column inventory_tag_prefix text,
  add constraint tenants_inventory_tag_prefix_format
    check (inventory_tag_prefix ~ '^[A-Z]{3}$'),
  -- Unique across tenants, so a tag found in the wrong organization's bin
  -- says whose it is.
  add constraint tenants_inventory_tag_prefix_key unique (inventory_tag_prefix);

comment on column public.tenants.inventory_tag_prefix is
  'Three upper-case letters that start every numbered inventory tag code (#1444), e.g. CSN in CSN-007. Locked once the tenant has a numbered code, because printed labels and written NFC tags carry it.';

-- The three live tenants, by name (docs/tenants.md: a seed names its tenant).
-- A database without them updates nothing.
update public.tenants set inventory_tag_prefix = 'CSN' where slug = 'chatter-snow';
update public.tenants set inventory_tag_prefix = 'DEM' where custom_domain = 'demo.rickiecruz.com';
update public.tenants set inventory_tag_prefix = 'PLT' where custom_domain = 'portal.rickiecruz.com';

create function public.lock_inventory_tag_prefix()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.inventory_tag_prefix is distinct from new.inventory_tag_prefix
     and exists (
       select 1 from public.inventory_item_tags
        where tenant_id = old.id and kind = 'numbered'
     ) then
    raise exception 'INVENTORY_TAG_PREFIX_LOCKED'
      using hint = 'Numbered codes already carry this prefix.';
  end if;
  return new;
end;
$$;

revoke execute on function public.lock_inventory_tag_prefix() from public, anon, authenticated;

create trigger lock_inventory_tag_prefix
  before update of inventory_tag_prefix on public.tenants
  for each row execute function public.lock_inventory_tag_prefix();

-- tenants is not writable by authenticated beyond `name`, so the prefix is set
-- through here, by whoever manages inventory: it shapes one feature, not the
-- organization (docs/portal-navigation.md, on where configuration lives).
create function public.set_inventory_tag_prefix(p_prefix text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_prefix text := upper(btrim(coalesce(p_prefix, '')));
begin
  if not public.has_permission('inventory', 'manage') then
    raise exception 'Not authorized to set the tag prefix';
  end if;
  if v_prefix !~ '^[A-Z]{3}$' then
    raise exception 'INVENTORY_TAG_PREFIX_INVALID';
  end if;
  if exists (
    select 1 from public.tenants
     where inventory_tag_prefix = v_prefix and id <> v_tenant_id
  ) then
    raise exception 'INVENTORY_TAG_PREFIX_TAKEN';
  end if;

  update public.tenants set inventory_tag_prefix = v_prefix where id = v_tenant_id;
  return v_prefix;
end;
$$;

comment on function public.set_inventory_tag_prefix(text) is
  'Sets the tenant''s numbered-tag prefix (#1444): three letters, unique across tenants, locked once a numbered code exists. inventory:manage.';

revoke execute on function public.set_inventory_tag_prefix(text) from public, anon;
grant execute on function public.set_inventory_tag_prefix(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. The `numbered` kind
-- ---------------------------------------------------------------------------

alter table public.inventory_item_tags
  add column number integer,
  drop constraint inventory_item_tags_kind_check,
  add constraint inventory_item_tags_kind_check
    check (kind in ('asset_tag', 'barcode', 'nfc', 'numbered')),
  drop constraint inventory_item_tags_item_required,
  add constraint inventory_item_tags_item_required
    check (item_id is not null or kind in ('asset_tag', 'numbered')),
  add constraint inventory_item_tags_number_for_numbered
    check ((kind = 'numbered') = (number is not null) and (number is null or number > 0));

comment on column public.inventory_item_tags.number is
  'The number of a numbered code (#1444) -- 7 for CSN-007 -- for sorting, ranges and lookup by number. Null for every other kind.';

drop index public.inventory_item_tags_unique_value;
create unique index inventory_item_tags_unique_value
  on public.inventory_item_tags (tenant_id, kind, value)
  where kind in ('asset_tag', 'nfc', 'numbered');

create unique index inventory_item_tags_unique_number
  on public.inventory_item_tags (tenant_id, number)
  where kind = 'numbered';

-- An item holds at most one numbered code, beside its random one if it has one.
create unique index inventory_item_tags_one_numbered_per_item
  on public.inventory_item_tags (tenant_id, item_id)
  where kind = 'numbered' and item_id is not null;

-- `CSN-007` for 7, `CSN-1000` for 1000: lpad() would cut a longer number.
create function public.format_numbered_inventory_tag(p_prefix text, p_number integer)
returns text
language sql
immutable
set search_path = public
as $$
  select p_prefix || '-' || case
    when p_number < 1000 then lpad(p_number::text, 3, '0')
    else p_number::text
  end;
$$;

-- What a person types or scans for a numbered code, as its number: `7`,
-- `007`, `CSN-7`, `csn007` and `CSN-007` are all 7. A prefix, when given, has
-- to be this tenant's -- another organization's CSN-007 is not ours. Null for
-- anything that isn't a numbered code. Mirrors parseNumberedTag() in
-- src/lib/inventory-tags.ts.
create function public.inventory_numbered_tag_number(p_code text)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_match text[] := regexp_match(
    upper(btrim(coalesce(p_code, ''))),
    '^(?:([A-Z]{3})\s*-?\s*)?0*([0-9]{1,6})$'
  );
  v_number integer;
begin
  if v_match is null then
    return null;
  end if;
  if v_match[1] is not null and v_match[1] is distinct from (
    select inventory_tag_prefix from public.tenants
     where id = public.current_tenant_id()
  ) then
    return null;
  end if;
  v_number := v_match[2]::integer;
  return nullif(v_number, 0);
end;
$$;

revoke execute on function public.inventory_numbered_tag_number(text) from public, anon;
grant execute on function public.inventory_numbered_tag_number(text) to authenticated;

-- set_inventory_item_tag_value() gains the numbered case. A new numbered row
-- takes the next number under a lock on its tenant's row, so two admins
-- generating codes at once queue rather than collide, whatever number the
-- insert named. A numbered code is deleted by nobody (see the delete policy
-- below), so the highest number is never given out twice.
create or replace function public.set_inventory_item_tag_value()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefix text;
begin
  if tg_op = 'UPDATE' and (old.kind = 'numbered' or new.kind = 'numbered') then
    if new.kind is distinct from old.kind
       or new.value is distinct from old.value
       or new.number is distinct from old.number then
      raise exception 'A numbered code cannot be renumbered or changed to another kind';
    end if;
    return new;
  end if;

  if new.kind = 'numbered' then
    select inventory_tag_prefix into v_prefix
      from public.tenants
     where id = new.tenant_id
       for update;
    if v_prefix is null then
      raise exception 'INVENTORY_TAG_PREFIX_MISSING'
        using hint = 'Set the tag prefix before generating numbered codes.';
    end if;
    select coalesce(max(number), 0) + 1 into new.number
      from public.inventory_item_tags
     where tenant_id = new.tenant_id and kind = 'numbered';
    new.value := public.format_numbered_inventory_tag(v_prefix, new.number);
  elsif new.kind = 'asset_tag' then
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

drop trigger set_inventory_item_tag_value on public.inventory_item_tags;
create trigger set_inventory_item_tag_value
  before insert or update of kind, value, number on public.inventory_item_tags
  for each row execute function public.set_inventory_item_tag_value();

-- A numbered code is a printed label and a written NFC tag: deleting the row
-- would leave both pointing at nothing, and would let its number be issued
-- again. It is unassigned instead.
drop policy "inventory_item_tags delete" on public.inventory_item_tags;
create policy "inventory_item_tags delete" on public.inventory_item_tags
  for delete to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('inventory', 'manage')
    and kind <> 'numbered'
  );

-- ---------------------------------------------------------------------------
-- 3. Assignment history
-- ---------------------------------------------------------------------------

create table public.inventory_item_tag_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) default public.default_tenant_id(),
  tag_id uuid not null,
  item_id uuid not null,
  assigned_at timestamptz not null default now(),
  assigned_by uuid default auth.uid() references auth.users(id),
  released_at timestamptz,
  released_by uuid references auth.users(id),
  -- distributed / retired / lost: the item left, and the code came back by
  -- itself. moved: the code was put on another item. replaced: this item was
  -- given another numbered code. unassigned: taken off by hand.
  release_reason text,
  unique (tenant_id, id),
  constraint inventory_item_tag_assignments_tag_in_tenant
    foreign key (tenant_id, tag_id)
    references public.inventory_item_tags (tenant_id, id) on delete cascade,
  constraint inventory_item_tag_assignments_item_in_tenant
    foreign key (tenant_id, item_id)
    references public.inventory_items (tenant_id, id) on delete cascade,
  constraint inventory_item_tag_assignments_release_reason_check
    check (release_reason in ('distributed', 'retired', 'lost', 'moved', 'replaced', 'unassigned')),
  constraint inventory_item_tag_assignments_released_together
    check ((released_at is null) = (release_reason is null))
);

-- A code is on one item at a time.
create unique index inventory_item_tag_assignments_one_open_per_tag
  on public.inventory_item_tag_assignments (tenant_id, tag_id)
  where released_at is null;

create index inventory_item_tag_assignments_item_idx
  on public.inventory_item_tag_assignments (tenant_id, item_id);

comment on table public.inventory_item_tag_assignments is
  'Each time a numbered inventory tag code (#1444) was on an item: from when, until when, and why it came off. Written only by the trigger on inventory_item_tags, so it cannot disagree with the tag''s item_id.';

-- Read by whoever can read the item; written by nobody but the trigger.
alter table public.inventory_item_tag_assignments enable row level security;

create policy "inventory_item_tag_assignments select" on public.inventory_item_tag_assignments
  for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('inventory', 'view')
  );

grant select on public.inventory_item_tag_assignments to authenticated;

insert into public.audited_tables (table_name, pk_column, redacted_columns) values
  ('inventory_item_tag_assignments', 'id', '{}');

create trigger audit_log_row after insert or update or delete
  on public.inventory_item_tag_assignments
  for each row execute function public.audit_log_row();

-- Why a code comes off rides in a transaction-local setting, because the
-- update that frees it is the same few words whatever the reason. Unset, a
-- code taken off its item is 'unassigned', or 'moved' when it went straight
-- onto another.
create function public.record_inventory_tag_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text := nullif(current_setting('app.inventory_tag_release_reason', true), '');
begin
  if new.kind <> 'numbered' then
    return null;
  end if;
  if tg_op = 'UPDATE' and old.item_id is not distinct from new.item_id then
    return null;
  end if;

  if tg_op = 'UPDATE' and old.item_id is not null then
    update public.inventory_item_tag_assignments
       set released_at = now(),
           released_by = auth.uid(),
           release_reason = coalesce(
             v_reason,
             case when new.item_id is null then 'unassigned' else 'moved' end
           )
     where tenant_id = new.tenant_id
       and tag_id = new.id
       and released_at is null;
  end if;

  if new.item_id is not null then
    insert into public.inventory_item_tag_assignments (tenant_id, tag_id, item_id)
    values (new.tenant_id, new.id, new.item_id);
  end if;
  return null;
end;
$$;

revoke execute on function public.record_inventory_tag_assignment() from public, anon, authenticated;

create trigger record_inventory_tag_assignment
  after insert or update of item_id on public.inventory_item_tags
  for each row execute function public.record_inventory_tag_assignment();

-- ---------------------------------------------------------------------------
-- 4. Freed when the item leaves
-- ---------------------------------------------------------------------------

-- A trigger rather than a line in each RPC, because an item leaves by more
-- roads than two: record_event_distribution (and record_distribution_draft
-- through it), a giveaway winner's handout, a gear request, and the status
-- field on the item's own edit sheet. Every one of them is an update of
-- inventory_items.status. Security definer, since the intake volunteer who
-- records a handout can't write tags under RLS. Random codes stay put: they
-- are the item's identity, not a slot.
create function public.release_numbered_tags_on_item_exit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('distributed', 'retired', 'lost')
     and old.status is distinct from new.status then
    perform set_config('app.inventory_tag_release_reason', new.status, true);
    update public.inventory_item_tags
       set item_id = null
     where tenant_id = new.tenant_id
       and item_id = new.id
       and kind = 'numbered';
    perform set_config('app.inventory_tag_release_reason', '', true);
  end if;
  return null;
end;
$$;

revoke execute on function public.release_numbered_tags_on_item_exit() from public, anon, authenticated;

create trigger release_numbered_tags_on_item_exit
  after update of status on public.inventory_items
  for each row execute function public.release_numbered_tags_on_item_exit();

-- Deleting an item would cascade to its tags and take a numbered code out of
-- the pool with it. The code comes off first; the item's assignment rows go
-- with the item.
create function public.release_numbered_tags_on_item_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.inventory_item_tags
     set item_id = null
   where tenant_id = old.tenant_id
     and item_id = old.id
     and kind = 'numbered';
  return old;
end;
$$;

revoke execute on function public.release_numbered_tags_on_item_delete() from public, anon, authenticated;

create trigger release_numbered_tags_on_item_delete
  before delete on public.inventory_items
  for each row execute function public.release_numbered_tags_on_item_delete();

-- ---------------------------------------------------------------------------
-- 5. Generating, assigning, unassigning
-- ---------------------------------------------------------------------------

-- The next p_count numbers, free. One insert per code, so each takes the
-- tenant lock in turn. Capped at one print run's worth, like
-- create_blank_asset_tags (MAX_LABEL_ITEMS in src/lib/inventory-labels.ts).
create function public.generate_numbered_inventory_tags(p_count integer)
returns table (id uuid, number integer, value text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
begin
  if not public.has_permission('inventory', 'manage') then
    raise exception 'Not authorized to create numbered codes';
  end if;
  if p_count is null or p_count < 1 or p_count > 150 then
    raise exception 'Choose between 1 and 150 codes';
  end if;

  for i in 1..p_count loop
    return query
    insert into public.inventory_item_tags (tenant_id, item_id, kind, value)
    values (v_tenant_id, null, 'numbered', '')
    returning inventory_item_tags.id, inventory_item_tags.number, inventory_item_tags.value;
  end loop;
end;
$$;

comment on function public.generate_numbered_inventory_tags(integer) is
  'Creates the tenant''s next p_count numbered tag codes (#1444), free, for printing and writing to NFC tags. inventory:manage.';

revoke execute on function public.generate_numbered_inventory_tags(integer) from public, anon;
grant execute on function public.generate_numbered_inventory_tags(integer) to authenticated;

-- Puts the numbered code the person has in hand on an item.
--
--   outcome 'assigned'  -- done. If the item already had another numbered
--                          code, that one is free now ('replaced').
--   outcome 'already'   -- the item already holds it.
--   outcome 'held'      -- another item holds it; nothing changed. The caller
--                          confirms, and calls again with p_move.
--   outcome 'unknown'   -- no such code in this tenant.
--   outcome 'item_gone' -- the item is distributed, retired or lost.
--
-- Security invoker: the reads and the update go through the tag table's own
-- RLS, which is inventory:manage for a write.
create function public.assign_numbered_inventory_tag(
  p_item_id uuid,
  p_code text,
  p_move boolean default false
)
returns table (outcome text, code text, holder_item_id uuid, holder_description text)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_number integer := public.inventory_numbered_tag_number(p_code);
  v_tag public.inventory_item_tags%rowtype;
  v_status text;
begin
  if not public.has_permission('inventory', 'manage') then
    raise exception 'Not authorized to assign tag codes';
  end if;

  select status into v_status
    from public.inventory_items
   where id = p_item_id and tenant_id = v_tenant_id
     for update;
  if not found then
    raise exception 'Inventory item not found';
  end if;

  if v_number is not null then
    select * into v_tag
      from public.inventory_item_tags t
     where t.tenant_id = v_tenant_id and t.kind = 'numbered' and t.number = v_number
       for update;
  end if;
  if v_tag.id is null then
    return query select 'unknown'::text, null::text, null::uuid, null::text;
    return;
  end if;

  if v_status in ('distributed', 'retired', 'lost') then
    return query select 'item_gone'::text, v_tag.value, null::uuid, null::text;
    return;
  end if;
  if v_tag.item_id = p_item_id then
    return query select 'already'::text, v_tag.value, p_item_id, null::text;
    return;
  end if;
  if v_tag.item_id is not null and not coalesce(p_move, false) then
    return query
      select 'held'::text, v_tag.value, i.id, i.description
        from public.inventory_items i
       where i.id = v_tag.item_id;
    return;
  end if;

  perform set_config('app.inventory_tag_release_reason', 'replaced', true);
  update public.inventory_item_tags
     set item_id = null
   where tenant_id = v_tenant_id
     and kind = 'numbered'
     and item_id = p_item_id;
  perform set_config('app.inventory_tag_release_reason', '', true);

  update public.inventory_item_tags set item_id = p_item_id where id = v_tag.id;

  return query select 'assigned'::text, v_tag.value, null::uuid, null::text;
end;
$$;

comment on function public.assign_numbered_inventory_tag(uuid, text, boolean) is
  'Puts a numbered tag code (#1444), typed or scanned, on an item. Asks before moving a code another item holds (outcome ''held''; call again with p_move). inventory:manage.';

revoke execute on function public.assign_numbered_inventory_tag(uuid, text, boolean) from public, anon;
grant execute on function public.assign_numbered_inventory_tag(uuid, text, boolean) to authenticated;

-- The manual escape hatch: the item keeps its history, the code goes back in
-- the pool. Returns the code taken off, or null when the item had none.
create function public.unassign_numbered_inventory_tag(p_item_id uuid)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_code text;
begin
  if not public.has_permission('inventory', 'manage') then
    raise exception 'Not authorized to unassign tag codes';
  end if;

  perform set_config('app.inventory_tag_release_reason', 'unassigned', true);
  update public.inventory_item_tags
     set item_id = null
   where tenant_id = public.current_tenant_id()
     and kind = 'numbered'
     and item_id = p_item_id
  returning value into v_code;
  perform set_config('app.inventory_tag_release_reason', '', true);

  return v_code;
end;
$$;

revoke execute on function public.unassign_numbered_inventory_tag(uuid) from public, anon;
grant execute on function public.unassign_numbered_inventory_tag(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Which tags a handout freed
-- ---------------------------------------------------------------------------

-- The tags to take off the gear before it goes out. A distributed movement
-- and the release it caused are written in one transaction, so they share
-- now(): the movement's created_at is the assignment's released_at. That is
-- what ties them, rather than the caller's guess of what the item held.
-- Security definer, because whoever records a handout at the intake table
-- reads neither tags nor items under RLS; it answers only the grants that may
-- record one, and only about movements in this tenant.
create function public.released_numbered_inventory_tags(p_movement_ids uuid[])
returns table (item_id uuid, description text, code text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
begin
  if not (public.has_permission('inventory', 'manage') or public.has_permission('inventory_intake', 'manage')) then
    raise exception 'Not authorized to record a distribution';
  end if;

  return query
  select i.id, i.description, t.value
    from public.inventory_movements m
    join public.inventory_item_tag_assignments a
      on a.tenant_id = m.tenant_id
     and a.item_id = m.inventory_item_id
     and a.released_at = m.created_at
     and a.release_reason = 'distributed'
    join public.inventory_item_tags t on t.id = a.tag_id
    join public.inventory_items i on i.id = m.inventory_item_id
   where m.tenant_id = v_tenant_id
     and m.id = any(p_movement_ids)
     and m.movement_type = 'distributed'
   order by t.number;
end;
$$;

comment on function public.released_numbered_inventory_tags(uuid[]) is
  'The numbered tag codes (#1444) the given distributed movements freed, with their items, so the handout can say which tags to take off. inventory:manage or inventory_intake:manage.';

revoke execute on function public.released_numbered_inventory_tags(uuid[]) from public, anon;
grant execute on function public.released_numbered_inventory_tags(uuid[]) to authenticated;

-- record_distribution_draft() now says which tags came off. The return type
-- changes, so it is dropped rather than replaced. Otherwise unchanged from
-- 20260927150000 but for keeping each movement's id.
drop function public.record_distribution_draft(uuid, timestamptz, text, uuid, boolean);

create function public.record_distribution_draft(
  p_event_id uuid default null,
  p_occurred_at timestamptz default now(),
  p_reason text default null,
  p_recipient_person_id uuid default null,
  p_mark_item_distributed boolean default true
)
returns table (recorded integer, released_tags jsonb)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_draft_id uuid;
  v_recipient_id uuid;
  v_item_id uuid;
  v_movement_ids uuid[] := '{}';
begin
  select id, coalesce(p_recipient_person_id, recipient_person_id)
    into v_draft_id, v_recipient_id
    from public.inventory_distribution_drafts
   where user_id = auth.uid()
     and event_id is not distinct from p_event_id;

  if v_draft_id is null then
    raise exception 'DRAFT_EMPTY';
  end if;

  for v_item_id in
    select d.item_id from public.inventory_distribution_draft_items d
     where d.draft_id = v_draft_id
     order by d.created_at
  loop
    begin
      v_movement_ids := v_movement_ids || public.record_event_distribution(
        v_item_id, 1, p_reason, p_event_id, v_recipient_id,
        coalesce(p_occurred_at, now()), p_mark_item_distributed
      );
    exception when raise_exception then
      if sqlerrm = 'ITEM_ALREADY_DISTRIBUTED' then
        raise exception 'ITEM_ALREADY_DISTRIBUTED' using detail = v_item_id::text;
      end if;
      raise;
    end;
  end loop;

  if cardinality(v_movement_ids) = 0 then
    raise exception 'DRAFT_EMPTY';
  end if;

  delete from public.inventory_distribution_drafts where id = v_draft_id;

  return query
  select cardinality(v_movement_ids),
         coalesce(
           (select jsonb_agg(jsonb_build_object(
                     'item_id', r.item_id, 'description', r.description, 'code', r.code))
              from public.released_numbered_inventory_tags(v_movement_ids) r),
           '[]'::jsonb
         );
end;
$$;

revoke execute on function public.record_distribution_draft(uuid, timestamptz, text, uuid, boolean) from public, anon;
grant execute on function public.record_distribution_draft(uuid, timestamptz, text, uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Intake accepts a free numbered code
-- ---------------------------------------------------------------------------
--
-- create_donation_with_items and inventory_intake_scan, from 20260923200000,
-- each with one addition: where a scanned label is not a blank random code,
-- a free numbered code is tried next. An item bound to a numbered code gets
-- no random code as well -- it has the tag it arrived with.

create or replace function public.create_donation_with_items(
  p_donor_name text,
  p_donor_is_anonymous boolean,
  p_donor_source_type text,
  p_donor_email text,
  p_donor_phone text,
  p_donor_notes text,
  p_items jsonb,
  p_event_id uuid default null,
  p_donated_at date default null
)
returns table (
  donation_id uuid,
  inventory_item_ids uuid[],
  giveaway_id uuid,
  untiered_item_ids uuid[],
  asset_tags text[]
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
  v_tenant_id uuid := public.current_tenant_id();
  v_asset_tag text;
  v_barcode text;
  v_code text;
  v_codes text[] := '{}';
begin
  if not (public.has_permission('finance', 'manage') or public.has_permission('inventory_intake', 'manage')) then
    raise exception 'Not authorized to record a donation';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 then
    raise exception 'At least one item is required';
  end if;

  if p_event_id is not null and not exists (
    select 1 from public.events where id = p_event_id and tenant_id = v_tenant_id
  ) then
    raise exception 'Event not found';
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

  -- The caller's own calendar day, not the database's. `current_date` on a
  -- UTC server is already tomorrow for anyone recording an evening intake west
  -- of Greenwich, which is exactly when gear arrives -- at an event, after
  -- dark. It stays as the fallback for a direct SQL insert that names no day.
  insert into public.donations (donor_id, event_id, donated_at)
  values (v_donor_id, p_event_id, coalesce(p_donated_at, current_date))
  returning id into v_donation_id;

  if p_event_id is not null then
    select g.id into v_giveaway_id
    from public.giveaways g
    where g.event_id = p_event_id
      and g.tenant_id = v_tenant_id
      and exists (select 1 from public.giveaway_tiers t where t.giveaway_id = g.id);
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_category_id := null;
    if nullif(v_item->>'category_key', '') is not null then
      select c.id into v_category_id
      from public.inventory_categories c
      where c.key = v_item->>'category_key'
        and c.tenant_id = v_tenant_id;
    end if;
    if v_category_id is null then
      v_category_id := public.resolve_inventory_category(v_item->>'type', v_tenant_id);
    end if;

    -- created_at from the clock rather than the transaction (#1420): every
    -- item in one donation otherwise shares now(), and the labels printed for
    -- the donation (inventory_intake_labels) have to come out in the order the
    -- items were entered, which is the order they are on the table.
    insert into public.inventory_items
      (donation_id, description, size, type, gender, condition, face_value, notes, intended_use, category_id, photo_url, created_at)
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
      v_category_id,
      -- Anything that isn't an http(s) URL is dropped rather than stored; see
      -- 20260907170000.
      case when v_item->>'photo_url' ~ '^https?://' then v_item->>'photo_url' end,
      clock_timestamp()
    )
    returning id into v_item_id;

    v_item_ids := array_append(v_item_ids, v_item_id);

    insert into public.inventory_movements (inventory_item_id, movement_type, quantity, reason)
    values (v_item_id, 'received', 1, 'Donation intake');

    -- The item's code (#1420). A pre-printed blank label scanned at intake is
    -- bound to it; otherwise a new code is generated. Either way it happens
    -- here, so a received item is never left untagged. A code that is not an
    -- unassigned label of this tenant -- mistyped, already on another item,
    -- or scanned twice in this donation -- fails the whole donation rather
    -- than quietly issuing a different code than the one stuck on the item.
    v_asset_tag := upper(nullif(btrim(v_item->>'asset_tag'), ''));
    if v_asset_tag is not null then
      update public.inventory_item_tags
         set item_id = v_item_id
       where tenant_id = v_tenant_id
         and kind = 'asset_tag'
         and value = v_asset_tag
         and item_id is null
      returning value into v_code;
      -- A reusable numbered code (#1444) that is free now. `7`, `007` and
      -- `CSN-007` all name it; another tenant's prefix names nothing.
      if v_code is null then
        update public.inventory_item_tags
           set item_id = v_item_id
         where tenant_id = v_tenant_id
           and kind = 'numbered'
           and number = public.inventory_numbered_tag_number(v_asset_tag)
           and item_id is null
        returning value into v_code;
      end if;
      if v_code is null then
        raise exception 'Label % is not an unused label or a free numbered code', v_asset_tag
          using errcode = 'P0001', hint = 'asset_tag_unavailable';
      end if;
    else
      insert into public.inventory_item_tags (tenant_id, item_id, kind, value)
      values (v_tenant_id, v_item_id, 'asset_tag', '')
      returning value into v_code;
    end if;
    v_codes := array_append(v_codes, v_code);
    v_code := null;

    -- A manufacturer barcode read off the item as it arrived. Not unique: the
    -- same UPC on twenty pairs of gloves is twenty rows.
    v_barcode := nullif(btrim(v_item->>'barcode'), '');
    if v_barcode is not null then
      insert into public.inventory_item_tags (tenant_id, item_id, kind, value)
      values (v_tenant_id, v_item_id, 'barcode', v_barcode);
    end if;

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
        perform public.grant_giveaway_tickets(
          v_giveaway_id, v_tier_id, 1, v_donation_id, v_item_id, null
        );
      end if;
    end if;
  end loop;

  return query select v_donation_id, v_item_ids, v_giveaway_id, v_untiered, v_codes;
end;
$$;


create or replace function public.inventory_intake_scan(p_asset_tag text, p_barcode text)
returns table (
  asset_tag_status text,
  barcode_known boolean,
  barcode_description text,
  barcode_category_key text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_code text := upper(nullif(btrim(p_asset_tag), ''));
  v_barcode text := nullif(btrim(p_barcode), '');
  v_item_id uuid;
begin
  if not (public.has_permission('finance', 'manage') or public.has_permission('inventory_intake', 'manage')) then
    raise exception 'Not authorized to record a donation';
  end if;

  asset_tag_status := null;
  if v_code is not null then
    select case when t.item_id is null then 'blank' else 'assigned' end
      into asset_tag_status
      from public.inventory_item_tags t
     where t.tenant_id = v_tenant_id and t.kind = 'asset_tag' and t.value = v_code;
    -- Then a reusable numbered code (#1444), typed with or without its
    -- prefix. A random code is looked up first: `234567` can be either.
    if asset_tag_status is null then
      select case when t.item_id is null then 'blank' else 'assigned' end
        into asset_tag_status
        from public.inventory_item_tags t
       where t.tenant_id = v_tenant_id
         and t.kind = 'numbered'
         and t.number = public.inventory_numbered_tag_number(v_code);
    end if;
    asset_tag_status := coalesce(asset_tag_status, 'unknown');
  end if;

  barcode_known := false;
  if v_barcode is not null then
    select t.item_id into v_item_id
      from public.inventory_item_tags t
     where t.tenant_id = v_tenant_id and t.kind = 'barcode' and t.value = v_barcode
     order by t.created_at desc
     limit 1;
    if v_item_id is not null then
      barcode_known := true;
      select i.description, c.key
        into barcode_description, barcode_category_key
        from public.inventory_items i
        left join public.inventory_categories c on c.id = i.category_id
       where i.id = v_item_id and i.tenant_id = v_tenant_id;
    end if;
  end if;

  return next;
end;
$$;


-- ---------------------------------------------------------------------------
-- 8. The item's history shows its numbered codes
-- ---------------------------------------------------------------------------
--
-- inventory_item_history and inventory_actor_name, from 20260927120000: the
-- history gains a tag_assigned and a tag_released entry per assignment, and
-- the actor lookup answers for whoever assigned or released one.

create or replace function public.inventory_item_history(p_item_id uuid)
returns table (
  entry_kind text,
  entry_id uuid,
  occurred_at timestamptz,
  donated_on date,
  movement_type text,
  quantity integer,
  reason text,
  notes text,
  event_id uuid,
  event_name text,
  donation_id uuid,
  donor_id uuid,
  donor_name text,
  donor_is_anonymous boolean,
  donor_source_type text,
  intake_route text,
  recipient_id uuid,
  recipient_name text,
  gear_request_id uuid,
  recorded_by uuid,
  recorded_by_name text
)
language sql
stable
security invoker
set search_path = public
as $$
  with item as (
    select i.id, i.donation_id, i.created_at, i.created_by
      from public.inventory_items i
     where i.id = p_item_id
  ),
  intake as (
    select m.id, m.occurred_at, m.reason, m.event_id, m.created_by
      from public.inventory_movements m
      join item on m.inventory_item_id = item.id
     where m.movement_type = 'received'
     order by m.occurred_at, m.created_at, m.id
     limit 1
  ),
  entries as (
    select
      'donated'::text as entry_kind,
      item.donation_id as entry_id,
      coalesce(intake.occurred_at, item.created_at) as occurred_at,
      d.donated_at as donated_on,
      null::text as movement_type,
      null::integer as quantity,
      null::text as reason,
      d.notes,
      e.id as event_id,
      e.name as event_name,
      d.id as donation_id,
      p.id as donor_id,
      p.name as donor_name,
      p.is_anonymous as donor_is_anonymous,
      p.source_type as donor_source_type,
      case intake.reason
        when 'Donation intake' then 'intake_form'
        when 'Sponsor contribution' then 'event_sponsor'
      end as intake_route,
      null::uuid as recipient_id,
      null::text as recipient_name,
      null::uuid as gear_request_id,
      coalesce(d.created_by, intake.created_by, item.created_by) as recorded_by
    from item
    left join intake on true
    left join public.donations d on d.id = item.donation_id
    left join public.people p on p.id = d.donor_id
    left join public.events e on e.id = coalesce(d.event_id, intake.event_id)

    union all

    select
      'movement',
      m.id,
      m.occurred_at,
      null,
      m.movement_type,
      m.quantity,
      m.reason,
      m.notes,
      e.id,
      e.name,
      null,
      null,
      null,
      null,
      null,
      null,
      r.id,
      r.name,
      g.id,
      m.created_by
    from public.inventory_movements m
    join item on m.inventory_item_id = item.id
    left join public.events e on e.id = m.event_id
    left join public.people r on r.id = m.recipient_person_id
    left join public.gear_requests g on g.id = m.gear_request_id
    where m.id is distinct from (select intake.id from intake)

    union all

    -- A reusable numbered code put on this item (#1444), and taken off it.
    -- `reason` carries the code and `notes` why it came off, so the columns
    -- stay the ones the card already reads.
    select
      'tag_assigned', a.id, a.assigned_at, null, null, null, t.value, null,
      null, null, null, null, null, null, null, null, null, null, null,
      a.assigned_by
    from public.inventory_item_tag_assignments a
    join item on a.item_id = item.id
    join public.inventory_item_tags t on t.id = a.tag_id

    union all

    select
      'tag_released', a.id, a.released_at, null, null, null, t.value,
      a.release_reason,
      null, null, null, null, null, null, null, null, null, null, null,
      a.released_by
    from public.inventory_item_tag_assignments a
    join item on a.item_id = item.id
    join public.inventory_item_tags t on t.id = a.tag_id
    where a.released_at is not null
  )
  select entries.*, public.inventory_actor_name(entries.recorded_by)
    from entries
   -- Newest first, and the Donated entry always last: it is where the item
   -- came from, even when a movement was backdated before it.
   order by (entries.entry_kind = 'donated'), entries.occurred_at desc,
     entries.entry_id;
$$;


create or replace function public.inventory_actor_name(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
    u.email
  )
  from auth.users u
  where u.id = p_user_id
    and public.has_permission('inventory', 'view')
    and (
      exists (
        select 1 from public.inventory_items i
         where i.tenant_id = (select public.current_tenant_id())
           and i.created_by = u.id
      )
      or exists (
        select 1 from public.inventory_movements m
         where m.tenant_id = (select public.current_tenant_id())
           and m.created_by = u.id
      )
      or exists (
        select 1 from public.inventory_item_tag_assignments a
         where a.tenant_id = (select public.current_tenant_id())
           and (a.assigned_by = u.id or a.released_by = u.id)
      )
      or exists (
        select 1 from public.donations d
         where d.tenant_id = (select public.current_tenant_id())
           and d.created_by = u.id
      )
    );
$$;


-- ---------------------------------------------------------------------------
-- 9. Self-check
-- ---------------------------------------------------------------------------

do $check$
declare
  v_policies text;
begin
  select string_agg(policyname, ', ') into v_policies
    from pg_policies
   where schemaname = 'public'
     and tablename in ('inventory_item_tags', 'inventory_item_tag_assignments')
     and coalesce(qual, '') || coalesce(with_check, '') not like '%current_tenant_id()%';

  if v_policies is not null then
    raise exception 'numbered-tag policies without the tenant predicate: %', v_policies;
  end if;
end;
$check$;
