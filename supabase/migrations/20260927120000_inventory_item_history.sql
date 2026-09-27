-- #1442: an inventory item's history -- who donated it, how and when, and
-- every movement since.
--
-- ONE READ, UNDER THE CALLER'S OWN RLS. `inventory_item_history` is
-- `security invoker`, so each table it touches answers exactly as it would to
-- a plain select from the same user:
--
--   * `donations` (finance:view, inventory:manage or inventory_intake:manage)
--     and `people` (people:view and its carve-outs) decide whether the donor is
--     named. That is the same pair the donation page's
--     `donor:people!inner(...)` join needs, so the history names a donor to
--     exactly the readers who could open that donation's page, and to nobody
--     else. Anybody else still sees that the item was donated, and when.
--   * `inventory_movements`, `events`, `gear_requests` and `people` (the
--     recipient) each keep their own policy. An unreadable event or recipient
--     comes back null rather than hiding the entry.
--   * A cross-tenant item id finds no `inventory_items` row, so it returns
--     nothing at all.
--
-- `audit_log` is deliberately not a source: its select policy is
-- administration:manage, so an inventory volunteer would see nothing.
--
-- THE DONATED ENTRY ABSORBS THE INTAKE MOVEMENT. Both ways a donated item is
-- created -- create_donation_with_items (reason 'Donation intake') and the
-- event sponsor sync (reason 'Sponsor contribution') -- write a `received`
-- movement in the same transaction. Shown on its own it would repeat the
-- Donated entry beside it, so the item's earliest `received` movement is
-- folded into that entry: it supplies the route the item came in by, and the
-- date and recorder for a reader who cannot read `donations`. Any later
-- `received` (a return, say) is an ordinary movement.
--
-- WHO RECORDED IT. `created_by` is an auth user, and `auth.users` is not
-- readable by `authenticated`, so the name comes from a small definer helper,
-- `inventory_actor_name`, in the pattern of list_expense_actors: it answers
-- only an inventory:view holder, and only about a user who recorded something
-- in this tenant's inventory.
--
-- NOT HERE YET: tag assignment events wait on #1444's assignment table, and
-- category or condition edits have no source short of `audit_log`.

create function public.inventory_actor_name(p_user_id uuid)
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
        select 1 from public.donations d
         where d.tenant_id = (select public.current_tenant_id())
           and d.created_by = u.id
      )
    );
$$;

comment on function public.inventory_actor_name(uuid) is
  'The display name of the user who recorded an inventory item, movement or donation in this tenant (#1442). Answers an inventory:view holder only; null otherwise.';

revoke execute on function public.inventory_actor_name(uuid) from public, anon;
grant execute on function public.inventory_actor_name(uuid) to authenticated;

create function public.inventory_item_history(p_item_id uuid)
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
  )
  select entries.*, public.inventory_actor_name(entries.recorded_by)
    from entries
   -- Newest first, and the Donated entry always last: it is where the item
   -- came from, even when a movement was backdated before it.
   order by (entries.entry_kind = 'donated'), entries.occurred_at desc,
     entries.entry_id;
$$;

comment on function public.inventory_item_history(uuid) is
  'An inventory item''s history (#1442): a Donated entry, then every movement since, newest first. Security invoker, so RLS on donations, people, events, movements and gear requests applies to the caller as it would to a plain select.';

revoke execute on function public.inventory_item_history(uuid) from public, anon;
grant execute on function public.inventory_item_history(uuid) to authenticated;
