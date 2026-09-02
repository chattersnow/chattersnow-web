-- Issue #520: the giveaway "Add prize" form needs to list donations that
-- could be a prize's source, but inventory_items/donations/monetary_donations
-- are gated on inventory:*/finance:* permissions, which event_coordinator --
-- the role that manages events, sponsors, and giveaways -- holds 'none' of
-- (20260822090000_create_resources_and_role_permissions.sql). A plain select
-- under the caller's own RLS would come back empty for exactly the role this
-- feature is for. security definer with an explicit events:manage check
-- mirrors get_finance_report_data (20260828010000), which crosses the same
-- kind of boundary the other direction (finance_reports:view reading event
-- data).
create or replace function public.list_available_giveaway_sources(p_event_id uuid)
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
          select 1 from public.giveaway_prizes gp where gp.source_inventory_item_id = ii.id
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
          select 1 from public.giveaway_prizes gp where gp.source_monetary_donation_id = md.id
        )
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.list_available_giveaway_sources(uuid) to authenticated;
