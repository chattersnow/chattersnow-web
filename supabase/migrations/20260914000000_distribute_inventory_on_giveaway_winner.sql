-- Renumbered from 20260913000000 (#1051). The run that would have applied it
-- was cancelled, every later migration reached the hosted database first, and
-- `supabase db push` refuses to insert a version before the last applied one.
-- Nothing had applied this file anywhere, so moving it to the end is safe.

-- A prize backed by an in-kind donation reserves its inventory item when the
-- prize is created (20260901070000), and until now nothing ever moved it
-- again: upsertGiveawayWinnerAction wrote the giveaway_winners row straight
-- from the client, so marking a winner "distributed" left
-- inventory_items.status at 'reserved' and recorded no 'distributed'
-- movement. The item stayed in the Reserved bucket of the inventory list --
-- and, because a giveaway reservation has no recipient, with no name beside
-- it -- while never appearing in any distribution view or the valuation
-- report's distributed group.
--
-- Handing a prize to its winner *is* a distribution, so that write has to
-- reach inventory_items, and that crosses the same permission boundary the
-- prize RPCs already cross: giveaway_winners is gated on events:*,
-- inventory_items on inventory:*, and event_coordinator -- whose feature this
-- is -- holds events:manage and no inventory permission (20260822090000).
-- Hence one security definer RPC doing both in one transaction, replacing the
-- client-side upsert.
--
-- The status mapping is deliberately narrow, following the same "newer
-- information wins" rule as release_inventory_item_from_giveaway:
--
--   distributed   -> item 'distributed' + a 'distributed' movement, but only
--                    from 'reserved'. An item already marked distributed,
--                    damaged or lost is not re-decided by this form.
--   anything else -> item back to 'reserved' + a 'corrected' movement, but
--                    only from 'distributed', so undoing a mis-clicked
--                    winner reverses exactly what this function did and
--                    nothing else. 'unclaimed' lands here on purpose: the
--                    prize is still spoken for, so the item stays reserved.

create function public.upsert_giveaway_winner(
  p_prize_id uuid,
  p_winner_name text,
  p_winner_contact text default null,
  p_distribution_status text default 'pending',
  p_distributed_at timestamptz default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := (select public.current_tenant_id());
  v_event_id uuid;
  v_item_id uuid;
  v_item_status text;
  v_winner_id uuid;
  v_winner_person_id uuid;
begin
  if not public.has_permission('events', 'manage') then
    raise exception 'Not authorized to manage this giveaway';
  end if;

  select g.event_id, gp.source_inventory_item_id
  into v_event_id, v_item_id
  from public.giveaway_prizes gp
  join public.giveaways g on g.id = gp.giveaway_id
  where gp.id = p_prize_id
    and gp.tenant_id = v_tenant_id;

  if not found then
    raise exception 'PRIZE_NOT_FOUND';
  end if;

  insert into public.giveaway_winners
    (tenant_id, giveaway_prize_id, winner_name, winner_contact,
     distribution_status, distributed_at, notes)
  values
    (v_tenant_id, p_prize_id, p_winner_name, p_winner_contact,
     coalesce(p_distribution_status, 'pending'), p_distributed_at, p_notes)
  on conflict (giveaway_prize_id) do update
  set winner_name = excluded.winner_name,
      winner_contact = excluded.winner_contact,
      distribution_status = excluded.distribution_status,
      distributed_at = excluded.distributed_at,
      notes = excluded.notes
  returning id, winner_person_id into v_winner_id, v_winner_person_id;

  if v_item_id is null then
    return v_winner_id;
  end if;

  select status into v_item_status
  from public.inventory_items
  where id = v_item_id
    and tenant_id = v_tenant_id
  for update;

  if not found then
    return v_winner_id;
  end if;

  if p_distribution_status = 'distributed' and v_item_status = 'reserved' then
    insert into public.inventory_movements
      (tenant_id, inventory_item_id, movement_type, quantity, occurred_at,
       reason, event_id, recipient_person_id)
    values
      (v_tenant_id, v_item_id, 'distributed', 1,
       coalesce(p_distributed_at, now()), 'Giveaway prize awarded',
       v_event_id, v_winner_person_id);

    update public.inventory_items
    set status = 'distributed'
    where id = v_item_id
      and tenant_id = v_tenant_id;

  elsif p_distribution_status is distinct from 'distributed'
    and v_item_status = 'distributed' then
    insert into public.inventory_movements
      (tenant_id, inventory_item_id, movement_type, quantity, reason, event_id)
    values
      (v_tenant_id, v_item_id, 'corrected', 1,
       'Giveaway prize distribution reversed', v_event_id);

    update public.inventory_items
    set status = 'reserved'
    where id = v_item_id
      and tenant_id = v_tenant_id;
  end if;

  return v_winner_id;
end;
$$;

grant execute on function public.upsert_giveaway_winner(uuid, text, text, text, timestamptz, text) to authenticated;

-- Existing rows: a prize whose winner is already marked distributed while its
-- item still sits at 'reserved' is this bug's output, not a decision anyone
-- made, so correct it rather than leave every past giveaway wrong. The
-- movement is attributed to whoever recorded the winner and dated from that
-- row, which is as close to the truth as the data allows; the item's
-- updated_by becomes null because a migration has no auth.uid(), which is
-- accurate -- nobody did this, a migration did.
insert into public.inventory_movements
  (tenant_id, inventory_item_id, movement_type, quantity, occurred_at, reason,
   event_id, created_by)
select ii.tenant_id, ii.id, 'distributed', 1,
       coalesce(gw.distributed_at, gw.updated_at),
       'Giveaway prize awarded', g.event_id, gw.created_by
from public.giveaway_winners gw
join public.giveaway_prizes gp on gp.id = gw.giveaway_prize_id
join public.giveaways g on g.id = gp.giveaway_id
join public.inventory_items ii on ii.id = gp.source_inventory_item_id
where gw.distribution_status = 'distributed'
  and ii.status = 'reserved';

update public.inventory_items ii
set status = 'distributed'
from public.giveaway_winners gw
join public.giveaway_prizes gp on gp.id = gw.giveaway_prize_id
where gp.source_inventory_item_id = ii.id
  and gw.distribution_status = 'distributed'
  and ii.status = 'reserved';
