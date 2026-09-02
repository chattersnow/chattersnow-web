-- Issue #520: giveaway_prizes.source_inventory_item_id/source_monetary_
-- donation_id are readable directly (giveaway_prizes RLS is scoped to
-- events:*), but embedding inventory_items/monetary_donations in the same
-- select to show what a prize was sourced from would come back null under
-- RLS for event_coordinator, same boundary problem as
-- list_available_giveaway_sources (20260830190000). This RPC resolves the
-- display label for each sourced prize in one call so
-- getEventGiveawayAction can merge it onto the plain giveaway_prizes read.
create or replace function public.get_giveaway_prize_sources(p_giveaway_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.has_permission('events', 'view') then
    raise exception 'Not authorized to view this giveaway';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', gp.id,
    'source_item', case when ii.id is null then null else
      jsonb_build_object('id', ii.id, 'description', ii.description)
    end,
    'source_donation', case when md.id is null then null else
      jsonb_build_object('id', md.id, 'amount', md.amount)
    end
  )), '[]'::jsonb)
  into v_result
  from public.giveaway_prizes gp
  left join public.inventory_items ii on ii.id = gp.source_inventory_item_id
  left join public.monetary_donations md on md.id = gp.source_monetary_donation_id
  where gp.giveaway_id = p_giveaway_id
    and (gp.source_inventory_item_id is not null or gp.source_monetary_donation_id is not null);

  return v_result;
end;
$$;

grant execute on function public.get_giveaway_prize_sources(uuid) to authenticated;
