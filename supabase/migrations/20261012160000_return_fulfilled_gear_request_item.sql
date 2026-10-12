-- Return an item on a fulfilled gear request to the shelf (#1567).
-- ---------------------------------------------------------------------------
--
-- Fulfilling a request distributes what it holds (#1566), and from then on the
-- request is history: its item list is read-only (REQUEST_CLOSED). When an
-- item turned out not to be handed over after all, staff need to say so
-- without reopening the request -- un-distributing everything and re-holding
-- it would churn every item's history and invite a second handover.
--
-- So one item at a time: an `other` movement carrying the request id records
-- the return, and the item goes `distributed -> available`. The request stays
-- `fulfilled`, and the original `reserved` and `distributed` movements stay
-- as they are -- the hold and the handover were both recorded, and the return
-- is read as what came after them. Only an item whose latest movement is this
-- request's handover qualifies: one handed over at the checkout without the
-- request, or moved on since, is not this request's to take back.
--
-- An extra item given at the meetup is not a request edit at all; it is
-- recorded through the handout checkout with the requester as recipient.

create function public.return_gear_request_item(
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
  v_latest public.inventory_movements%rowtype;
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
  if v_request.status <> 'fulfilled' then
    raise exception 'REQUEST_NOT_FULFILLED';
  end if;

  select status into v_status
    from public.inventory_items
   where id = p_inventory_item_id
     and tenant_id = v_tenant_id
   for update;

  if not found then
    raise exception 'ITEM_NOT_FOUND';
  end if;

  select * into v_latest
    from public.inventory_movements m
   where m.tenant_id = v_tenant_id
     and m.inventory_item_id = p_inventory_item_id
   order by m.occurred_at desc, m.created_at desc
   limit 1;

  if v_status <> 'distributed'
     or v_latest.movement_type is distinct from 'distributed'
     or v_latest.gear_request_id is distinct from p_request_id then
    raise exception 'ITEM_NOT_HANDED_OVER';
  end if;

  insert into public.inventory_movements
    (tenant_id, inventory_item_id, movement_type, quantity, reason,
     recipient_person_id, gear_request_id)
  values
    (v_tenant_id, p_inventory_item_id, 'other', 1,
     'Returned after gear request fulfilled', v_request.person_id, p_request_id);

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

comment on function public.return_gear_request_item(uuid, uuid) is
  'Staff put one item from a fulfilled gear request back on the shelf when it was not actually handed over (#1567). Records an `other` movement linked to the request and sets the item available; the request stays fulfilled. Refuses a request that is not fulfilled and an item whose latest movement is not this request''s handover.';

revoke execute on function public.return_gear_request_item(uuid, uuid) from public, anon;
grant execute on function public.return_gear_request_item(uuid, uuid) to authenticated;

comment on column public.inventory_movements.gear_request_id is
  'The public gear request this movement belongs to (#1032): its reserved holds, the `other` release when staff remove an item (#1527), the `distributed` handover when the request is fulfilled, and the `other` return when a fulfilled item goes back on the shelf (#1567). Null on manual holds, on movements from before the header existed, and on every other movement.';

-- ---------------------------------------------------------------------------
-- The requester's own history stops calling a returned item received
-- ---------------------------------------------------------------------------

-- Body from 20261005230000_gear_request_item_edits.sql. The one change is in
-- the `received` half: a request's handover followed by a return on the same
-- request is not something the requester has. A removal (#1527) also writes
-- an `other` movement on the request, but always before any handover on it,
-- so the "later than" test tells the two apart.
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
     and not (
       m.gear_request_id is not null
       and exists (
         select 1
           from public.inventory_movements r
          where r.gear_request_id = m.gear_request_id
            and r.inventory_item_id = m.inventory_item_id
            and r.movement_type = 'other'
            and (r.occurred_at, r.created_at) > (m.occurred_at, m.created_at)
       )
     )

   order by 3 desc, 1, 2;
$$;

comment on function public.my_gear_history() is
  'The caller''s own gear requests and the items handed over to them (#1163), discriminated by `kind`. Requests and handovers are separate rows on purpose: a pending request is not a receipt. A request''s handover later returned to the shelf (#1567) is not listed as received.';

revoke execute on function public.my_gear_history() from public, anon;
grant execute on function public.my_gear_history() to authenticated;
