-- Issue #570: #520 (20260830170000) gave giveaway_prizes a reference to the
-- inventory_items/monetary_donations row a prize came from, and
-- 20260830190000 gave the "Add prize" form a list to pick from. What it did
-- not do is mark the inventory item as spoken for: linking a prize wrote
-- only the FK, leaving inventory_items.status = 'available', so the same
-- physical item still showed up in the Record-distribution picker
-- (home/distribution-actions.ts) and in the public gear catalog
-- (20260819020000, `where status = 'available'`). The only thing keeping it
-- out of a second prize was the `not exists` subquery inside
-- list_available_giveaway_sources, which protects the giveaway picker from
-- itself and nothing else.
--
-- Allocation has to happen in the same statement as the prize write, and it
-- has to be security definer: giveaway_prizes is gated on events:*, but
-- inventory_items is gated on inventory:*, and event_coordinator -- the role
-- this whole feature is for -- holds events:manage and none of the inventory
-- permissions (20260822090000). Two client-side calls would fail on the
-- second one. Same boundary, and the same fix, as
-- list_available_giveaway_sources and sync_event_sponsor_donations
-- (20260830180000).
--
-- Reserve/release semantics follow request_gear_items (20260826370000), the
-- existing allocation path: `select ... for update` before any mutation, so
-- two coordinators can't race the same item onto two prizes (the FK is not
-- unique, so nothing else prevents it).
--
-- Reusing the existing 'reserved' status rather than inventing a giveaway-
-- specific one is deliberate: every read site already keys off
-- 'available' vs not, so the public catalog, the distribution picker and the
-- inventory valuation report (reports/valuation.ts groups by status) all
-- reflect the allocation with no changes. One cosmetic consequence worth
-- knowing: inventory/items/page.tsx resolves a "held by" person for reserved
-- items from the movement's recipient_person_id. A giveaway allocation has
-- no recipient, so such a row renders as reserved with no requester name --
-- correct, not a missing join.

-- Reserve an item for a prize. No-op when p_inventory_item_id is null.
create function public.reserve_inventory_item_for_giveaway(
  p_inventory_item_id uuid,
  p_event_id uuid
) returns void
language plpgsql
set search_path = public
as $$
declare
  v_status text;
begin
  if p_inventory_item_id is null then
    return;
  end if;

  select status into v_status
  from public.inventory_items
  where id = p_inventory_item_id
  for update;

  if not found then
    raise exception 'ITEM_NOT_FOUND';
  end if;

  if v_status <> 'available' then
    raise exception 'ITEM_NOT_AVAILABLE';
  end if;

  insert into public.inventory_movements
    (inventory_item_id, movement_type, quantity, reason, event_id)
  values
    (p_inventory_item_id, 'reserved', 1, 'Allocated as giveaway prize', p_event_id);

  update public.inventory_items
  set status = 'reserved'
  where id = p_inventory_item_id;
end;
$$;

-- Release an item previously reserved for a prize. Only touches items still
-- sitting at 'reserved': if staff have since marked the item distributed,
-- damaged or lost, that is newer information than this link and releasing
-- would clobber it. There is no prior release path in the repo to copy;
-- 'other' is the closest movement_type in the existing vocabulary
-- (20260819000000) -- this is not a correction of a mistaken entry, which is
-- what 'corrected' means elsewhere.
create function public.release_inventory_item_from_giveaway(
  p_inventory_item_id uuid,
  p_event_id uuid
) returns void
language plpgsql
set search_path = public
as $$
declare
  v_status text;
begin
  if p_inventory_item_id is null then
    return;
  end if;

  select status into v_status
  from public.inventory_items
  where id = p_inventory_item_id
  for update;

  if not found or v_status <> 'reserved' then
    return;
  end if;

  insert into public.inventory_movements
    (inventory_item_id, movement_type, quantity, reason, event_id)
  values
    (p_inventory_item_id, 'other', 1, 'Released from giveaway prize', p_event_id);

  update public.inventory_items
  set status = 'available'
  where id = p_inventory_item_id;
end;
$$;

revoke execute on function public.reserve_inventory_item_for_giveaway(uuid, uuid) from public;
revoke execute on function public.release_inventory_item_from_giveaway(uuid, uuid) from public;

create function public.create_giveaway_prize(
  p_giveaway_id uuid,
  p_prize_name text,
  p_donor_person_id uuid default null,
  p_estimated_value numeric default null,
  p_notes text default null,
  p_source_inventory_item_id uuid default null,
  p_source_monetary_donation_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_prize_id uuid;
begin
  if not public.has_permission('events', 'manage') then
    raise exception 'Not authorized to manage this giveaway';
  end if;

  select event_id into v_event_id
  from public.giveaways
  where id = p_giveaway_id;

  if not found then
    raise exception 'GIVEAWAY_NOT_FOUND';
  end if;

  perform public.reserve_inventory_item_for_giveaway(
    p_source_inventory_item_id, v_event_id
  );

  insert into public.giveaway_prizes
    (giveaway_id, prize_name, donor_person_id, estimated_value, notes,
     source_inventory_item_id, source_monetary_donation_id)
  values
    (p_giveaway_id, p_prize_name, p_donor_person_id, p_estimated_value, p_notes,
     p_source_inventory_item_id, p_source_monetary_donation_id)
  returning id into v_prize_id;

  return v_prize_id;
end;
$$;

-- Update swaps allocations when the source changes: the old item goes back to
-- available and the new one is reserved. Reserving first would fail on a
-- no-op save (source unchanged) because the item is already 'reserved', so
-- the release runs first -- and only when the source actually changed.
create function public.update_giveaway_prize(
  p_prize_id uuid,
  p_prize_name text,
  p_donor_person_id uuid default null,
  p_estimated_value numeric default null,
  p_notes text default null,
  p_source_inventory_item_id uuid default null,
  p_source_monetary_donation_id uuid default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_old_item_id uuid;
begin
  if not public.has_permission('events', 'manage') then
    raise exception 'Not authorized to manage this giveaway';
  end if;

  select g.event_id, gp.source_inventory_item_id
  into v_event_id, v_old_item_id
  from public.giveaway_prizes gp
  join public.giveaways g on g.id = gp.giveaway_id
  where gp.id = p_prize_id;

  if not found then
    raise exception 'PRIZE_NOT_FOUND';
  end if;

  if v_old_item_id is distinct from p_source_inventory_item_id then
    perform public.release_inventory_item_from_giveaway(v_old_item_id, v_event_id);
    perform public.reserve_inventory_item_for_giveaway(
      p_source_inventory_item_id, v_event_id
    );
  end if;

  update public.giveaway_prizes
  set prize_name = p_prize_name,
      donor_person_id = p_donor_person_id,
      estimated_value = p_estimated_value,
      notes = p_notes,
      source_inventory_item_id = p_source_inventory_item_id,
      source_monetary_donation_id = p_source_monetary_donation_id
  where id = p_prize_id;
end;
$$;

create function public.delete_giveaway_prize(p_prize_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_item_id uuid;
begin
  if not public.has_permission('events', 'manage') then
    raise exception 'Not authorized to manage this giveaway';
  end if;

  select g.event_id, gp.source_inventory_item_id
  into v_event_id, v_item_id
  from public.giveaway_prizes gp
  join public.giveaways g on g.id = gp.giveaway_id
  where gp.id = p_prize_id;

  if not found then
    return;
  end if;

  delete from public.giveaway_prizes where id = p_prize_id;

  perform public.release_inventory_item_from_giveaway(v_item_id, v_event_id);
end;
$$;

grant execute on function public.create_giveaway_prize(uuid, text, uuid, numeric, text, uuid, uuid) to authenticated;
grant execute on function public.update_giveaway_prize(uuid, text, uuid, numeric, text, uuid, uuid) to authenticated;
grant execute on function public.delete_giveaway_prize(uuid) to authenticated;

-- The source list excludes every already-linked item, which is right when
-- adding a prize but wrong when editing one: the prize's own current source
-- would be missing from its own dropdown. p_include_prize_id lets that one
-- row through. Dropped and recreated rather than `create or replace`d,
-- because adding a defaulted parameter creates a second overload and leaves
-- the 1-arg version behind to be resolved ambiguously.
drop function public.list_available_giveaway_sources(uuid);

create function public.list_available_giveaway_sources(
  p_event_id uuid,
  p_include_prize_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.has_permission('events', 'manage') then
    raise exception 'Not authorized to view available donations';
  end if;

  select jsonb_build_object(
    'inventoryItems', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ii.id,
        'description', ii.description,
        'face_value', ii.face_value,
        'donor', case when p.id is null then null else
          jsonb_build_object('id', p.id, 'name', p.name, 'email', p.email, 'phone', p.phone)
        end
      ))
      from public.inventory_items ii
      join public.donations d on d.id = ii.donation_id
      left join public.people p on p.id = d.donor_id
      where d.event_id = p_event_id
        and not exists (
          select 1 from public.giveaway_prizes gp
          where gp.source_inventory_item_id = ii.id
            and (p_include_prize_id is null or gp.id <> p_include_prize_id)
        )
    ), '[]'::jsonb),
    'monetaryDonations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', md.id,
        'amount', md.amount,
        'donor', case when p.id is null then null else
          jsonb_build_object('id', p.id, 'name', p.name, 'email', p.email, 'phone', p.phone)
        end
      ))
      from public.monetary_donations md
      left join public.people p on p.id = md.donor_id
      where md.event_id = p_event_id
        and not exists (
          select 1 from public.giveaway_prizes gp
          where gp.source_monetary_donation_id = md.id
            and (p_include_prize_id is null or gp.id <> p_include_prize_id)
        )
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.list_available_giveaway_sources(uuid, uuid) to authenticated;
