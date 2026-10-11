-- A fulfilled gear request hands over the items it holds.
-- ---------------------------------------------------------------------------
--
-- set_gear_request_status('fulfilled') stamped the header and nothing else, so
-- every item on a fulfilled request stayed `reserved` forever: out of the
-- catalog, counted as held on the request detail, and absent from the
-- requester's "received" history. Cancelling already released what the
-- request held; fulfilling now does the mirror image and distributes it.
--
-- Each item still `reserved` through one of this request's `reserved`
-- movements gets a `distributed` movement -- recipient the requester,
-- carrying the request id, the same shape record_event_distribution() writes
-- -- and its status becomes `distributed`. Numbered tags are released by the
-- release_numbered_tags_on_item_exit trigger, as for any handout. An item
-- already handed over at the checkout, or moved on some other way, is left
-- alone, which is the cancellation's rule too.
--
-- No as-is check here: a request's acknowledgement is on the request itself
-- (#1367), and staff may still fulfil one without it, as before.

-- set_gear_request_status(): body from 20260913230000, the live one. Only the
-- `fulfilled` branch changes.
create or replace function public.set_gear_request_status(
  p_request_id uuid,
  p_status text,
  p_quoted_amount numeric default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_request public.gear_requests%rowtype;
  v_item_id uuid;
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

  if p_status = 'quoted' then
    if v_request.delivery_method <> 'shipping' then
      raise exception 'NOT_SHIPPING';
    end if;
    if p_quoted_amount is null or p_quoted_amount < 0 then
      raise exception 'QUOTE_AMOUNT_REQUIRED';
    end if;
    update public.gear_requests
       set status = 'quoted',
           quoted_amount = p_quoted_amount,
           quoted_at = now(),
           paid_at = null,
           updated_by = auth.uid()
     where id = p_request_id;

  elsif p_status = 'paid' then
    if v_request.delivery_method <> 'shipping' then
      raise exception 'NOT_SHIPPING';
    end if;
    if v_request.quoted_at is null then
      raise exception 'QUOTE_REQUIRED';
    end if;
    update public.gear_requests
       set status = 'paid',
           paid_at = now(),
           updated_by = auth.uid()
     where id = p_request_id;

  elsif p_status = 'fulfilled' then
    update public.gear_requests
       set status = 'fulfilled',
           fulfilled_at = now(),
           updated_by = auth.uid()
     where id = p_request_id;

    -- Whatever this request still holds is handed over to the requester.
    for v_item_id in
      select i.id
        from public.inventory_items i
       where i.tenant_id = v_tenant_id
         and i.status = 'reserved'
         and i.id in (
           select m.inventory_item_id
             from public.inventory_movements m
            where m.gear_request_id = p_request_id
              and m.movement_type = 'reserved'
         )
       order by i.id
         for update of i
    loop
      insert into public.inventory_movements
        (tenant_id, inventory_item_id, movement_type, quantity, reason,
         recipient_person_id, gear_request_id)
      values
        (v_tenant_id, v_item_id, 'distributed', 1, 'Gear request fulfilled',
         v_request.person_id, p_request_id);

      update public.inventory_items
         set status = 'distributed',
             updated_by = auth.uid()
       where id = v_item_id;
    end loop;

  elsif p_status = 'cancelled' then
    update public.gear_requests
       set status = 'cancelled',
           cancelled_at = now(),
           updated_by = auth.uid()
     where id = p_request_id;

    -- Whatever this request was still holding goes back on the shelf. An item
    -- already handed over (distributed) or otherwise moved on is left alone.
    update public.inventory_items i
       set status = 'available',
           updated_by = auth.uid()
     where i.tenant_id = v_tenant_id
       and i.status = 'reserved'
       and i.id in (
         select m.inventory_item_id
           from public.inventory_movements m
          where m.gear_request_id = p_request_id
            and m.movement_type = 'reserved'
       );

  else
    raise exception 'STATUS_INVALID';
  end if;
end;
$$;

comment on function public.set_gear_request_status(uuid, text, numeric) is
  'The one write path for a gear request''s status (#1032): quoted (shipping only, with the postage amount), paid (after a quote), fulfilled (which distributes the items it still holds to the requester), or cancelled (which releases them). Refuses once fulfilled or cancelled.';

comment on column public.inventory_movements.gear_request_id is
  'The public gear request this movement belongs to (#1032): its reserved holds, the `other` release when staff remove an item (#1527), and the `distributed` handover when the request is fulfilled. Null on manual holds, on movements from before the header existed, and on every other movement.';

-- ---------------------------------------------------------------------------
-- Backfill: requests already fulfilled with their items still held
-- ---------------------------------------------------------------------------

-- Dated at the fulfilment, not today, so the item history reads in order.
with held as (
  select distinct r.tenant_id, r.id as request_id, r.person_id, r.fulfilled_at, i.id as item_id
    from public.gear_requests r
    join public.inventory_movements m
      on m.gear_request_id = r.id and m.movement_type = 'reserved'
    join public.inventory_items i
      on i.id = m.inventory_item_id and i.tenant_id = r.tenant_id
   where r.status = 'fulfilled'
     and i.status = 'reserved'
),
moved as (
  insert into public.inventory_movements
    (tenant_id, inventory_item_id, movement_type, quantity, occurred_at, reason,
     recipient_person_id, gear_request_id)
  select tenant_id, item_id, 'distributed', 1, fulfilled_at, 'Gear request fulfilled',
         person_id, request_id
    from held
  returning inventory_item_id
)
update public.inventory_items i
   set status = 'distributed'
 where i.id in (select inventory_item_id from moved);
