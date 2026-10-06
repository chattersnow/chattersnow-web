-- Staff edits to an open gear request (#1527): add an item to it, take one
-- out, and change its notes. Until now the only write after submission was
-- set_gear_request_status(), whose cancellation released every item at once.
--
-- What "an item on this request" means is unchanged: a `reserved` movement
-- carrying the request's id. Every reader keys on that -- the portal detail,
-- the staff notification count, the as-is acknowledgement page, the
-- cancellation's release -- so removing an item has to stop it matching.
-- The removal therefore detaches the original `reserved` movement from the
-- request (gear_request_id -> null; the hold itself still happened and stays
-- in the item's history) and records the release as its own movement, type
-- `other`, which carries the request id so the item's history links to the
-- request it left. Without the detach, a request cancelled after one of its
-- items had been removed and re-requested by someone else would release that
-- other person's hold.

-- ---------------------------------------------------------------------------
-- 1. Add an item
-- ---------------------------------------------------------------------------

create function public.add_gear_request_item(
  p_request_id uuid,
  p_inventory_item_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_request public.gear_requests%rowtype;
  v_status text;
begin
  if not public.has_permission('inventory', 'manage') then
    raise exception 'PERMISSION_DENIED';
  end if;

  select * into v_request
    from public.gear_requests
   where id = p_request_id
     and tenant_id = v_tenant_id
   for update;

  if not found then
    raise exception 'REQUEST_NOT_FOUND';
  end if;
  if v_request.status in ('fulfilled', 'cancelled') then
    raise exception 'REQUEST_CLOSED';
  end if;

  -- The same pool the public cart draws from: gear library stock that is
  -- on the shelf right now.
  select status into v_status
    from public.inventory_items
   where id = p_inventory_item_id
     and tenant_id = v_tenant_id
     and intended_use = 'gear_library'
   for update;

  if not found then
    raise exception 'ITEM_NOT_FOUND';
  end if;
  if v_status <> 'available' then
    raise exception 'ITEM_NOT_AVAILABLE';
  end if;

  insert into public.inventory_movements
    (tenant_id, inventory_item_id, movement_type, quantity, reason,
     recipient_person_id, gear_request_id)
  values
    (v_tenant_id, p_inventory_item_id, 'reserved', 1, 'Added to gear request',
     v_request.person_id, p_request_id);

  update public.inventory_items
     set status = 'reserved',
         updated_by = auth.uid()
   where id = p_inventory_item_id
     and tenant_id = v_tenant_id;

  update public.gear_requests
     set updated_by = auth.uid()
   where id = p_request_id;
end;
$$;

comment on function public.add_gear_request_item(uuid, uuid) is
  'Staff add one available gear library item to an open gear request (#1527), reserving it under the request exactly as the public cart does. Refuses a fulfilled or cancelled request and an item that is not on the shelf.';

revoke execute on function public.add_gear_request_item(uuid, uuid) from public, anon;
grant execute on function public.add_gear_request_item(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Remove an item
-- ---------------------------------------------------------------------------

create function public.remove_gear_request_item(
  p_request_id uuid,
  p_inventory_item_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_request public.gear_requests%rowtype;
  v_status text;
  v_hold_id uuid;
begin
  if not public.has_permission('inventory', 'manage') then
    raise exception 'PERMISSION_DENIED';
  end if;

  select * into v_request
    from public.gear_requests
   where id = p_request_id
     and tenant_id = v_tenant_id
   for update;

  if not found then
    raise exception 'REQUEST_NOT_FOUND';
  end if;
  if v_request.status in ('fulfilled', 'cancelled') then
    raise exception 'REQUEST_CLOSED';
  end if;

  select status into v_status
    from public.inventory_items
   where id = p_inventory_item_id
     and tenant_id = v_tenant_id
   for update;

  if not found then
    raise exception 'ITEM_NOT_FOUND';
  end if;

  select m.id into v_hold_id
    from public.inventory_movements m
   where m.tenant_id = v_tenant_id
     and m.gear_request_id = p_request_id
     and m.inventory_item_id = p_inventory_item_id
     and m.movement_type = 'reserved'
   order by m.occurred_at desc, m.created_at desc
   limit 1;

  -- Only an item this request is still holding: one handed over is recorded
  -- through Distribution and is not this request's to take back.
  if v_hold_id is null or v_status <> 'reserved' then
    raise exception 'ITEM_NOT_HELD';
  end if;

  -- A request with nothing on it is a cancelled request by another name, and
  -- cancelling says so to everyone who reads it.
  if not exists (
    select 1
      from public.inventory_movements m
     where m.tenant_id = v_tenant_id
       and m.gear_request_id = p_request_id
       and m.movement_type = 'reserved'
       and m.inventory_item_id <> p_inventory_item_id
  ) then
    raise exception 'LAST_ITEM';
  end if;

  update public.inventory_movements
     set gear_request_id = null
   where tenant_id = v_tenant_id
     and gear_request_id = p_request_id
     and inventory_item_id = p_inventory_item_id
     and movement_type = 'reserved';

  insert into public.inventory_movements
    (tenant_id, inventory_item_id, movement_type, quantity, reason,
     recipient_person_id, gear_request_id)
  values
    (v_tenant_id, p_inventory_item_id, 'other', 1, 'Removed from gear request',
     v_request.person_id, p_request_id);

  update public.inventory_items
     set status = 'available',
         updated_by = auth.uid()
   where id = p_inventory_item_id
     and tenant_id = v_tenant_id;

  update public.gear_requests
     set updated_by = auth.uid()
   where id = p_request_id;
end;
$$;

comment on function public.remove_gear_request_item(uuid, uuid) is
  'Staff take one held item off an open gear request and put it back on the shelf (#1527). Detaches the original reserved movement from the request and records the release as an `other` movement linked to it. Refuses an item the request is not holding, and the last item on the request (cancel instead).';

revoke execute on function public.remove_gear_request_item(uuid, uuid) from public, anon;
grant execute on function public.remove_gear_request_item(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Edit the notes
-- ---------------------------------------------------------------------------

create function public.set_gear_request_notes(
  p_request_id uuid,
  p_notes text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_status text;
begin
  if not public.has_permission('inventory', 'manage') then
    raise exception 'PERMISSION_DENIED';
  end if;

  select status into v_status
    from public.gear_requests
   where id = p_request_id
     and tenant_id = v_tenant_id
   for update;

  if not found then
    raise exception 'REQUEST_NOT_FOUND';
  end if;
  if v_status in ('fulfilled', 'cancelled') then
    raise exception 'REQUEST_CLOSED';
  end if;

  update public.gear_requests
     set notes = nullif(btrim(p_notes), ''),
         updated_by = auth.uid()
   where id = p_request_id;
end;
$$;

comment on function public.set_gear_request_notes(uuid, text) is
  'Staff edit an open gear request''s notes (#1527). Trims, and stores blank as null as the public form does. Refuses a fulfilled or cancelled request.';

revoke execute on function public.set_gear_request_notes(uuid, text) from public, anon;
grant execute on function public.set_gear_request_notes(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The requester's own history names only what is still on the request
-- ---------------------------------------------------------------------------

-- Body from 20260916070000_constituent_history.sql. The one change is the
-- `movement_type = 'reserved'` filter on a request's items: the release
-- movement a removal writes carries the request id too, and an item taken
-- off the request should not be read back to the requester as part of it.
create or replace function public.my_gear_history()
returns table (
  kind text,
  id uuid,
  occurred_at timestamptz,
  status text,
  delivery_method text,
  quoted_amount numeric,
  fulfilled_at timestamptz,
  cancelled_at timestamptz,
  note text,
  items text[],
  quantity integer
)
language sql
security definer
set search_path = public
stable
as $$
  with me as (
    select public.my_history_person_id('inventory') as person_id
  )
  select 'request'::text, r.id, r.created_at, r.status, r.delivery_method,
         r.quoted_amount, r.fulfilled_at, r.cancelled_at, r.notes,
         (select array_agg(distinct i.description)
            from public.inventory_movements m
            join public.inventory_items i on i.id = m.inventory_item_id
           where m.gear_request_id = r.id
             and m.movement_type = 'reserved'),
         null::integer
    from public.gear_requests r
   where r.person_id = (select person_id from me)

  union all
  select 'received'::text, m.id, m.occurred_at, null::text, null::text,
         null::numeric, null::timestamptz, null::timestamptz, null::text,
         array_remove(array[i.description], null),
         m.quantity
    from public.inventory_movements m
    left join public.inventory_items i on i.id = m.inventory_item_id
   where m.recipient_person_id = (select person_id from me)
     and m.movement_type = 'distributed'

   order by 3 desc, 1, 2;
$$;

comment on function public.my_gear_history() is
  'The caller''s own gear requests and the items handed over to them (#1163), discriminated by `kind`. Requests and handovers are separate rows on purpose: a pending request is not a receipt.';

revoke execute on function public.my_gear_history() from public, anon;
grant execute on function public.my_gear_history() to authenticated;
