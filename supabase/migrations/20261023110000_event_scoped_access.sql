-- #1687 (part of #1685): event-scoped RLS, RPCs and storage reach a guest's
-- per-event grant. #1686 added the grants and has_event_access(); this is
-- where they start to reach anything.
--
-- THE SHAPE. Every policy on an event-scoped table keeps its role check and
-- gains one arm:
--
--   public.has_permission('events', 'view')
--   or event_id = any ((select public.event_access_ids('event_logistics', 'view'))::uuid[])
--
-- which means exactly has_event_access(event_id, 'event_logistics', 'view'),
-- written so a list stays cheap (the cast makes ANY take the array rather than
-- read the subquery as a set). has_event_access() per row would be a
-- security definer call per row that cannot be inlined, and it ranks both the
-- role and the grant every time. Here the role check is the call the policy
-- already made, and the grant arm is an uncorrelated scalar subquery: ONE
-- InitPlan per statement, the caller's granted event ids for that table and
-- level, then an array test per row. Never a per-row InitPlan
-- (20260910010000). Numbers are in the PR body.
--
-- event_access_ids() is now the only place a grant's rules live: the grant is
-- the caller's, in the current tenant, at that level or higher, its areas
-- cover the table's area, the tenant offers that area, the account is not
-- deactivated and the area's module is on. has_event_access() and
-- event_access_rank() are redefined on top of it, so the policies, the RPCs
-- and my_event_access() cannot drift apart. It never widens has_permission(),
-- so tenant_isolation_gaps() and the isolation suite keep their meaning, and
-- every arm still sits under the policy's own tenant_id check.
--
-- Rows without an event_id of their own reach it through their parent: the
-- giveaway's children by giveaway_id, winners by prize, rule versions by rule
-- set (event_access_ids()'s p_parent).
--
-- WHAT STAYS ROLE-ONLY, on purpose:
--
-- - Creating and deleting an event. A grant is on an event that exists; it
--   is not a way to make more of them, and deleting the event would delete
--   the grant with it. (event_delete_blockers() likewise.)
-- - Writes to the tenant ledgers -- donations, monetary_donations, sales,
--   inventory_movements -- and the volunteer hour review queue. Their rows on
--   an event are readable through a grant (Revenue, Giveaway & goods, Staff),
--   but an insert or edit there moves the tenant's stock and books, which is
--   the ledger's own roles' job. donations delete stays is_admin().
-- - Tenant-wide settings: the set_* functions for media retention, uploads,
--   the public gallery, minors and Instagram. Their READERS answer a grant
--   holder (has_any_event_access()), since the event pages need the values.
-- - Event reports: get_event_report_data(), submit_event_report() and
--   get_event_impact_derived_data() mix money, goods, sponsors and
--   expenses behind one flag each; splitting them by area is #1688's call.
-- - delete_rider_profile(): a person's profile, not an event's.
--
-- The app's Server Actions still gate on requirePermission(); a guest reaches
-- the portal through #1688. Until then this is database-only.

-- ---------------------------------------------------------------------------
-- 1. The grant arm
-- ---------------------------------------------------------------------------

-- The ids the caller reaches through their own grants on one event-scoped
-- table at p_min_level: event ids, or with p_parent the ids of that parent
-- (giveaways, giveaway_prizes, giveaway_rules) on those events, for tables
-- that carry no event_id. Empty, never null, when nothing applies.
create function public.event_access_ids(
  p_table_name text,
  p_min_level text,
  p_parent text default 'events'
)
returns uuid[]
language sql
security definer
set search_path = public
stable
as $$
  with granted as (
    select g.event_id
      from public.event_access_area_tables m
      join public.resources res on res.key = m.resource_key
      join public.event_access_grants g
        on g.user_id = auth.uid()
       and g.tenant_id = (select public.current_tenant_id())
       and m.area_key = any (g.areas)
       and public.permission_rank(g.level) >= public.permission_rank(p_min_level)
     where m.table_name = p_table_name
       and public.permission_rank(p_min_level) > 0
       and m.area_key = any (public.event_access_offered_areas())
       and not exists (
         select 1 from public.deactivated_users du where du.user_id = auth.uid()
       )
       and public.module_enabled_for_tenant(g.tenant_id, res.module_key) is not false
  )
  select coalesce(case p_parent
    when 'events' then
      (select array_agg(event_id) from granted)
    when 'giveaways' then
      (select array_agg(gw.id)
         from public.giveaways gw
        where gw.event_id in (select event_id from granted))
    when 'giveaway_prizes' then
      (select array_agg(gp.id)
         from public.giveaway_prizes gp
         join public.giveaways gw on gw.id = gp.giveaway_id
        where gw.event_id in (select event_id from granted))
    when 'giveaway_rules' then
      (select array_agg(gr.id)
         from public.giveaway_rules gr
         join public.giveaways gw on gw.id = gr.giveaway_id
        where gw.event_id in (select event_id from granted))
  end, '{}');
$$;

comment on function public.event_access_ids(text, text, text) is
  'The event ids (or, with p_parent, the giveaway / prize / rule-set ids on those events) the caller reaches through their own per-event grants on one event-scoped table at p_min_level (#1687). The one definition of when a grant applies; has_event_access() and the event-scoped policies'' grant arm read it. Policies call it as an uncorrelated scalar subquery so it runs once per statement.';

revoke all on function public.event_access_ids(text, text, text) from public, anon;
grant execute on function public.event_access_ids(text, text, text) to authenticated;

-- Same contract as #1686's, now read off event_access_ids().
create or replace function public.event_access_rank(p_event_id uuid, p_table_name text)
returns smallint
language sql
security definer
set search_path = public
stable
as $$
  select greatest(
    (select case
       when public.has_permission(m.resource_key, 'manage') then 2
       when public.has_permission(m.resource_key, 'view') then 1
       else 0
     end
       from public.event_access_area_tables m
      where m.table_name = p_table_name),
    case
      when p_event_id = any (public.event_access_ids(p_table_name, 'manage')) then 2
      when p_event_id = any (public.event_access_ids(p_table_name, 'view')) then 1
      else 0
    end,
    0
  )::smallint;
$$;

-- For the tenant-wide readers an event page needs (is the gallery on, how
-- long is media kept): the table's role check, or a grant reaching that table
-- on any event.
create function public.has_any_event_access(p_table_name text, p_min_level text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select public.has_permission(m.resource_key, p_min_level)
       from public.event_access_area_tables m
      where m.table_name = p_table_name),
    false
  )
  or cardinality(public.event_access_ids(p_table_name, p_min_level)) > 0;
$$;

comment on function public.has_any_event_access(text, text) is
  'Whether the caller reaches one event-scoped table at p_min_level on ANY event (#1687): its role check, or a per-event grant that covers it. For tenant-wide settings readers that event pages need; never for a row of one event, which is has_event_access().';

revoke all on function public.has_any_event_access(text, text) from public, anon;
grant execute on function public.has_any_event_access(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Policies on event-scoped tables, by area
-- ---------------------------------------------------------------------------
--
-- Each one is the policy as it stands with the grant arm added beside the
-- check on the table's own resource (event_access_area_tables). A SELECT's
-- arm is always `view`; a write's is the level the policy already asked for.
-- Extra conditions (an expense's status and submitter, a hour's event_id)
-- are untouched.

-- Area: details

alter policy "event_checklist_items delete" on public.event_checklist_items
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or event_id = any ((select public.event_access_ids('event_checklist_items', 'manage'))::uuid[]))
  );

alter policy "event_checklist_items insert" on public.event_checklist_items
  with check (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or event_id = any ((select public.event_access_ids('event_checklist_items', 'manage'))::uuid[]))
  );

alter policy "event_checklist_items select" on public.event_checklist_items
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'view') or event_id = any ((select public.event_access_ids('event_checklist_items', 'view'))::uuid[]))
  );

alter policy "event_checklist_items update" on public.event_checklist_items
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or event_id = any ((select public.event_access_ids('event_checklist_items', 'manage'))::uuid[]))
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or event_id = any ((select public.event_access_ids('event_checklist_items', 'manage'))::uuid[]))
  );

alter policy "event_logistics delete" on public.event_logistics
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or event_id = any ((select public.event_access_ids('event_logistics', 'manage'))::uuid[]))
  );

alter policy "event_logistics insert" on public.event_logistics
  with check (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or event_id = any ((select public.event_access_ids('event_logistics', 'manage'))::uuid[]))
  );

alter policy "event_logistics select" on public.event_logistics
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'view') or event_id = any ((select public.event_access_ids('event_logistics', 'view'))::uuid[]))
  );

alter policy "event_logistics update" on public.event_logistics
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or event_id = any ((select public.event_access_ids('event_logistics', 'manage'))::uuid[]))
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or event_id = any ((select public.event_access_ids('event_logistics', 'manage'))::uuid[]))
  );

alter policy "event_programs delete" on public.event_programs
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or event_id = any ((select public.event_access_ids('event_programs', 'manage'))::uuid[]))
  );

alter policy "event_programs insert" on public.event_programs
  with check (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or event_id = any ((select public.event_access_ids('event_programs', 'manage'))::uuid[]))
  );

alter policy "event_programs select" on public.event_programs
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'view') or event_id = any ((select public.event_access_ids('event_programs', 'view'))::uuid[]))
  );

alter policy "event_programs update" on public.event_programs
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or event_id = any ((select public.event_access_ids('event_programs', 'manage'))::uuid[]))
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or event_id = any ((select public.event_access_ids('event_programs', 'manage'))::uuid[]))
  );

alter policy "events select" on public.events
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'view') or id = any ((select public.event_access_ids('events', 'view'))::uuid[]))
  );

alter policy "events update" on public.events
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or id = any ((select public.event_access_ids('events', 'manage'))::uuid[]))
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or id = any ((select public.event_access_ids('events', 'manage'))::uuid[]))
  );

-- Area: expenses

alter policy "event_expenses delete" on public.event_expenses
  using (
    tenant_id = (select public.current_tenant_id())
    and ((public.has_permission('event_expenses', 'manage') or event_id = any ((select public.event_access_ids('event_expenses', 'manage'))::uuid[])) and (status = any (array['submitted', 'rejected'])))
  );

alter policy "event_expenses insert" on public.event_expenses
  with check (
    tenant_id = (select public.current_tenant_id())
    and ((public.has_permission('event_expenses', 'manage') or event_id = any ((select public.event_access_ids('event_expenses', 'manage'))::uuid[])) and (submitted_by = auth.uid()) and (status = 'submitted'))
  );

alter policy "event_expenses select" on public.event_expenses
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('event_expenses', 'view') or event_id = any ((select public.event_access_ids('event_expenses', 'view'))::uuid[]))
  );

alter policy "event_expenses update" on public.event_expenses
  using (
    tenant_id = (select public.current_tenant_id())
    and ((public.has_permission('event_expenses', 'manage') or event_id = any ((select public.event_access_ids('event_expenses', 'manage'))::uuid[])) and (status = 'submitted'))
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and ((public.has_permission('event_expenses', 'manage') or event_id = any ((select public.event_access_ids('event_expenses', 'manage'))::uuid[])) and (status = 'submitted'))
  );

-- Area: goods

alter policy "donations select" on public.donations
  using (
    tenant_id = (select public.current_tenant_id())
    and ((public.has_permission('finance', 'view') or event_id = any ((select public.event_access_ids('donations', 'view'))::uuid[])) or public.has_permission('inventory', 'manage') or public.has_permission('inventory_intake', 'manage') or public.has_permission('inventory_reports', 'view'))
  );

alter policy "giveaway_buckets delete" on public.giveaway_buckets
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or giveaway_id = any ((select public.event_access_ids('giveaway_buckets', 'manage', 'giveaways'))::uuid[]))
  );

alter policy "giveaway_buckets insert" on public.giveaway_buckets
  with check (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or giveaway_id = any ((select public.event_access_ids('giveaway_buckets', 'manage', 'giveaways'))::uuid[]))
  );

alter policy "giveaway_buckets select" on public.giveaway_buckets
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'view') or giveaway_id = any ((select public.event_access_ids('giveaway_buckets', 'view', 'giveaways'))::uuid[]))
  );

alter policy "giveaway_buckets update" on public.giveaway_buckets
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or giveaway_id = any ((select public.event_access_ids('giveaway_buckets', 'manage', 'giveaways'))::uuid[]))
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or giveaway_id = any ((select public.event_access_ids('giveaway_buckets', 'manage', 'giveaways'))::uuid[]))
  );

alter policy "giveaway_prizes delete" on public.giveaway_prizes
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or giveaway_id = any ((select public.event_access_ids('giveaway_prizes', 'manage', 'giveaways'))::uuid[]))
  );

alter policy "giveaway_prizes insert" on public.giveaway_prizes
  with check (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or giveaway_id = any ((select public.event_access_ids('giveaway_prizes', 'manage', 'giveaways'))::uuid[]))
  );

alter policy "giveaway_prizes select" on public.giveaway_prizes
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'view') or giveaway_id = any ((select public.event_access_ids('giveaway_prizes', 'view', 'giveaways'))::uuid[]))
  );

alter policy "giveaway_prizes update" on public.giveaway_prizes
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or giveaway_id = any ((select public.event_access_ids('giveaway_prizes', 'manage', 'giveaways'))::uuid[]))
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or giveaway_id = any ((select public.event_access_ids('giveaway_prizes', 'manage', 'giveaways'))::uuid[]))
  );

alter policy "giveaway_rules delete" on public.giveaway_rules
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or giveaway_id = any ((select public.event_access_ids('giveaway_rules', 'manage', 'giveaways'))::uuid[]))
  );

alter policy "giveaway_rules insert" on public.giveaway_rules
  with check (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or giveaway_id = any ((select public.event_access_ids('giveaway_rules', 'manage', 'giveaways'))::uuid[]))
  );

alter policy "giveaway_rules select" on public.giveaway_rules
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'view') or giveaway_id = any ((select public.event_access_ids('giveaway_rules', 'view', 'giveaways'))::uuid[]))
  );

alter policy "giveaway_rules update" on public.giveaway_rules
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or giveaway_id = any ((select public.event_access_ids('giveaway_rules', 'manage', 'giveaways'))::uuid[]))
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or giveaway_id = any ((select public.event_access_ids('giveaway_rules', 'manage', 'giveaways'))::uuid[]))
  );

alter policy "giveaway_rules_versions select" on public.giveaway_rules_versions
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'view') or giveaway_rules_id = any ((select public.event_access_ids('giveaway_rules_versions', 'view', 'giveaway_rules'))::uuid[]))
  );

alter policy "giveaway_ticket_grants delete" on public.giveaway_ticket_grants
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or giveaway_id = any ((select public.event_access_ids('giveaway_ticket_grants', 'manage', 'giveaways'))::uuid[]))
  );

alter policy "giveaway_ticket_grants insert" on public.giveaway_ticket_grants
  with check (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or giveaway_id = any ((select public.event_access_ids('giveaway_ticket_grants', 'manage', 'giveaways'))::uuid[]))
  );

alter policy "giveaway_ticket_grants select" on public.giveaway_ticket_grants
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'view') or giveaway_id = any ((select public.event_access_ids('giveaway_ticket_grants', 'view', 'giveaways'))::uuid[]))
  );

alter policy "giveaway_ticket_grants update" on public.giveaway_ticket_grants
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or giveaway_id = any ((select public.event_access_ids('giveaway_ticket_grants', 'manage', 'giveaways'))::uuid[]))
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or giveaway_id = any ((select public.event_access_ids('giveaway_ticket_grants', 'manage', 'giveaways'))::uuid[]))
  );

alter policy "giveaway_ticket_packages delete" on public.giveaway_ticket_packages
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or giveaway_id = any ((select public.event_access_ids('giveaway_ticket_packages', 'manage', 'giveaways'))::uuid[]))
  );

alter policy "giveaway_ticket_packages insert" on public.giveaway_ticket_packages
  with check (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or giveaway_id = any ((select public.event_access_ids('giveaway_ticket_packages', 'manage', 'giveaways'))::uuid[]))
  );

alter policy "giveaway_ticket_packages select" on public.giveaway_ticket_packages
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'view') or giveaway_id = any ((select public.event_access_ids('giveaway_ticket_packages', 'view', 'giveaways'))::uuid[]))
  );

alter policy "giveaway_ticket_packages update" on public.giveaway_ticket_packages
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or giveaway_id = any ((select public.event_access_ids('giveaway_ticket_packages', 'manage', 'giveaways'))::uuid[]))
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or giveaway_id = any ((select public.event_access_ids('giveaway_ticket_packages', 'manage', 'giveaways'))::uuid[]))
  );

alter policy "giveaway_ticket_sales delete" on public.giveaway_ticket_sales
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or giveaway_id = any ((select public.event_access_ids('giveaway_ticket_sales', 'manage', 'giveaways'))::uuid[]))
  );

alter policy "giveaway_ticket_sales insert" on public.giveaway_ticket_sales
  with check (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or giveaway_id = any ((select public.event_access_ids('giveaway_ticket_sales', 'manage', 'giveaways'))::uuid[]))
  );

alter policy "giveaway_ticket_sales select" on public.giveaway_ticket_sales
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'view') or giveaway_id = any ((select public.event_access_ids('giveaway_ticket_sales', 'view', 'giveaways'))::uuid[]))
  );

alter policy "giveaway_ticket_sales update" on public.giveaway_ticket_sales
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or giveaway_id = any ((select public.event_access_ids('giveaway_ticket_sales', 'manage', 'giveaways'))::uuid[]))
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or giveaway_id = any ((select public.event_access_ids('giveaway_ticket_sales', 'manage', 'giveaways'))::uuid[]))
  );

alter policy "giveaway_tier_grants delete" on public.giveaway_tier_grants
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or giveaway_id = any ((select public.event_access_ids('giveaway_tier_grants', 'manage', 'giveaways'))::uuid[]))
  );

alter policy "giveaway_tier_grants insert" on public.giveaway_tier_grants
  with check (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or giveaway_id = any ((select public.event_access_ids('giveaway_tier_grants', 'manage', 'giveaways'))::uuid[]))
  );

alter policy "giveaway_tier_grants select" on public.giveaway_tier_grants
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'view') or giveaway_id = any ((select public.event_access_ids('giveaway_tier_grants', 'view', 'giveaways'))::uuid[]))
  );

alter policy "giveaway_tier_grants update" on public.giveaway_tier_grants
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or giveaway_id = any ((select public.event_access_ids('giveaway_tier_grants', 'manage', 'giveaways'))::uuid[]))
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or giveaway_id = any ((select public.event_access_ids('giveaway_tier_grants', 'manage', 'giveaways'))::uuid[]))
  );

alter policy "giveaway_tier_rules delete" on public.giveaway_tier_rules
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or giveaway_id = any ((select public.event_access_ids('giveaway_tier_rules', 'manage', 'giveaways'))::uuid[]))
  );

alter policy "giveaway_tier_rules insert" on public.giveaway_tier_rules
  with check (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or giveaway_id = any ((select public.event_access_ids('giveaway_tier_rules', 'manage', 'giveaways'))::uuid[]))
  );

alter policy "giveaway_tier_rules select" on public.giveaway_tier_rules
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'view') or giveaway_id = any ((select public.event_access_ids('giveaway_tier_rules', 'view', 'giveaways'))::uuid[]))
  );

alter policy "giveaway_tier_rules update" on public.giveaway_tier_rules
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or giveaway_id = any ((select public.event_access_ids('giveaway_tier_rules', 'manage', 'giveaways'))::uuid[]))
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or giveaway_id = any ((select public.event_access_ids('giveaway_tier_rules', 'manage', 'giveaways'))::uuid[]))
  );

alter policy "giveaway_tiers delete" on public.giveaway_tiers
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or giveaway_id = any ((select public.event_access_ids('giveaway_tiers', 'manage', 'giveaways'))::uuid[]))
  );

alter policy "giveaway_tiers insert" on public.giveaway_tiers
  with check (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or giveaway_id = any ((select public.event_access_ids('giveaway_tiers', 'manage', 'giveaways'))::uuid[]))
  );

alter policy "giveaway_tiers select" on public.giveaway_tiers
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'view') or giveaway_id = any ((select public.event_access_ids('giveaway_tiers', 'view', 'giveaways'))::uuid[]))
  );

alter policy "giveaway_tiers update" on public.giveaway_tiers
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or giveaway_id = any ((select public.event_access_ids('giveaway_tiers', 'manage', 'giveaways'))::uuid[]))
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or giveaway_id = any ((select public.event_access_ids('giveaway_tiers', 'manage', 'giveaways'))::uuid[]))
  );

alter policy "giveaway_winners delete" on public.giveaway_winners
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or giveaway_prize_id = any ((select public.event_access_ids('giveaway_winners', 'manage', 'giveaway_prizes'))::uuid[]))
  );

alter policy "giveaway_winners insert" on public.giveaway_winners
  with check (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or giveaway_prize_id = any ((select public.event_access_ids('giveaway_winners', 'manage', 'giveaway_prizes'))::uuid[]))
  );

alter policy "giveaway_winners select" on public.giveaway_winners
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'view') or giveaway_prize_id = any ((select public.event_access_ids('giveaway_winners', 'view', 'giveaway_prizes'))::uuid[]))
  );

alter policy "giveaway_winners update" on public.giveaway_winners
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or giveaway_prize_id = any ((select public.event_access_ids('giveaway_winners', 'manage', 'giveaway_prizes'))::uuid[]))
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or giveaway_prize_id = any ((select public.event_access_ids('giveaway_winners', 'manage', 'giveaway_prizes'))::uuid[]))
  );

alter policy "giveaways delete" on public.giveaways
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or event_id = any ((select public.event_access_ids('giveaways', 'manage'))::uuid[]))
  );

alter policy "giveaways insert" on public.giveaways
  with check (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or event_id = any ((select public.event_access_ids('giveaways', 'manage'))::uuid[]))
  );

alter policy "giveaways select" on public.giveaways
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'view') or event_id = any ((select public.event_access_ids('giveaways', 'view'))::uuid[]))
  );

alter policy "giveaways update" on public.giveaways
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or event_id = any ((select public.event_access_ids('giveaways', 'manage'))::uuid[]))
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or event_id = any ((select public.event_access_ids('giveaways', 'manage'))::uuid[]))
  );

alter policy "inventory_movements select" on public.inventory_movements
  using (
    tenant_id = (select public.current_tenant_id())
    and ((public.has_permission('inventory', 'manage') or event_id = any ((select public.event_access_ids('inventory_movements', 'view'))::uuid[])) or public.has_permission('inventory_reports', 'view'))
  );

-- Area: impact

alter policy "event_impact_notes delete" on public.event_impact_notes
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('event_impact', 'manage') or event_id = any ((select public.event_access_ids('event_impact_notes', 'manage'))::uuid[]))
  );

alter policy "event_impact_notes insert" on public.event_impact_notes
  with check (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('event_impact', 'manage') or event_id = any ((select public.event_access_ids('event_impact_notes', 'manage'))::uuid[]))
  );

alter policy "event_impact_notes select" on public.event_impact_notes
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('event_impact', 'view') or event_id = any ((select public.event_access_ids('event_impact_notes', 'view'))::uuid[]))
  );

alter policy "event_impact_notes update" on public.event_impact_notes
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('event_impact', 'manage') or event_id = any ((select public.event_access_ids('event_impact_notes', 'manage'))::uuid[]))
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('event_impact', 'manage') or event_id = any ((select public.event_access_ids('event_impact_notes', 'manage'))::uuid[]))
  );

alter policy "event_retro_items delete" on public.event_retro_items
  using (
    tenant_id = (select public.current_tenant_id())
    and ((public.has_permission('events', 'manage') or event_id = any ((select public.event_access_ids('event_retro_items', 'manage'))::uuid[])) or ((author_id = (select auth.uid())) and public.can_write_event_retro(event_id)))
  );

alter policy "event_retro_items select" on public.event_retro_items
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'view') or event_id = any ((select public.event_access_ids('event_retro_items', 'view'))::uuid[]))
  );

alter policy "event_retro_items update" on public.event_retro_items
  using (
    tenant_id = (select public.current_tenant_id())
    and ((public.has_permission('events', 'manage') or event_id = any ((select public.event_access_ids('event_retro_items', 'manage'))::uuid[])) or ((author_id = (select auth.uid())) and public.can_write_event_retro(event_id)))
  )
  with check (tenant_id = (select public.current_tenant_id())
  );

-- Area: incidents

alter policy "event_incidents delete" on public.event_incidents
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('event_incidents', 'manage') or event_id = any ((select public.event_access_ids('event_incidents', 'manage'))::uuid[]))
  );

alter policy "event_incidents insert" on public.event_incidents
  with check (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('event_incidents', 'manage') or event_id = any ((select public.event_access_ids('event_incidents', 'manage'))::uuid[]))
  );

alter policy "event_incidents select" on public.event_incidents
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('event_incidents', 'view') or event_id = any ((select public.event_access_ids('event_incidents', 'view'))::uuid[]))
  );

alter policy "event_incidents update" on public.event_incidents
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('event_incidents', 'manage') or event_id = any ((select public.event_access_ids('event_incidents', 'manage'))::uuid[]))
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('event_incidents', 'manage') or event_id = any ((select public.event_access_ids('event_incidents', 'manage'))::uuid[]))
  );

-- Area: media

alter policy "event_media delete" on public.event_media
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or event_id = any ((select public.event_access_ids('event_media', 'manage'))::uuid[]))
  );

alter policy "event_media select" on public.event_media
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'view') or event_id = any ((select public.event_access_ids('event_media', 'view'))::uuid[]))
  );

alter policy "event_media update" on public.event_media
  using (
    tenant_id = (select public.current_tenant_id())
    and ((public.has_permission('events', 'manage') or event_id = any ((select public.event_access_ids('event_media', 'manage'))::uuid[])) or ((uploaded_by = (select auth.uid())) and public.can_upload_event_media(event_id)))
  )
  with check (tenant_id = (select public.current_tenant_id())
  );

alter policy "event_media_upload_links select" on public.event_media_upload_links
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'view') or event_id = any ((select public.event_access_ids('event_media_upload_links', 'view'))::uuid[]))
  );

-- Area: registrations

alter policy "event_carpool_cars select" on public.event_carpool_cars
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'view') or event_id = any ((select public.event_access_ids('event_carpool_cars', 'view'))::uuid[]))
  );

alter policy "event_carpool_passengers select" on public.event_carpool_passengers
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'view') or event_id = any ((select public.event_access_ids('event_carpool_passengers', 'view'))::uuid[]))
  );

alter policy "event_registration_options select" on public.event_registration_options
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'view') or event_id = any ((select public.event_access_ids('event_registration_options', 'view'))::uuid[]))
  );

alter policy "event_registration_questions select" on public.event_registration_questions
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'view') or event_id = any ((select public.event_access_ids('event_registration_questions', 'view'))::uuid[]))
  );

alter policy "event_registrations delete" on public.event_registrations
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or event_id = any ((select public.event_access_ids('event_registrations', 'manage'))::uuid[]))
  );

alter policy "event_registrations insert" on public.event_registrations
  with check (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or event_id = any ((select public.event_access_ids('event_registrations', 'manage'))::uuid[]))
  );

alter policy "event_registrations select" on public.event_registrations
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'view') or event_id = any ((select public.event_access_ids('event_registrations', 'view'))::uuid[]))
  );

alter policy "event_registrations update" on public.event_registrations
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or event_id = any ((select public.event_access_ids('event_registrations', 'manage'))::uuid[]))
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or event_id = any ((select public.event_access_ids('event_registrations', 'manage'))::uuid[]))
  );

-- Area: revenue

alter policy "event_revenue delete" on public.event_revenue
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('event_revenue', 'manage') or event_id = any ((select public.event_access_ids('event_revenue', 'manage'))::uuid[]))
  );

alter policy "event_revenue insert" on public.event_revenue
  with check (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('event_revenue', 'manage') or event_id = any ((select public.event_access_ids('event_revenue', 'manage'))::uuid[]))
  );

alter policy "event_revenue select" on public.event_revenue
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('event_revenue', 'view') or event_id = any ((select public.event_access_ids('event_revenue', 'view'))::uuid[]))
  );

alter policy "event_revenue update" on public.event_revenue
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('event_revenue', 'manage') or event_id = any ((select public.event_access_ids('event_revenue', 'manage'))::uuid[]))
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('event_revenue', 'manage') or event_id = any ((select public.event_access_ids('event_revenue', 'manage'))::uuid[]))
  );

alter policy "monetary_donations select" on public.monetary_donations
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('finance', 'view') or event_id = any ((select public.event_access_ids('monetary_donations', 'view'))::uuid[]))
  );

alter policy "sales select" on public.sales
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('sales', 'view') or event_id = any ((select public.event_access_ids('sales', 'view'))::uuid[]))
  );

-- Area: sponsors

alter policy "discount_codes delete" on public.discount_codes
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or event_id = any ((select public.event_access_ids('discount_codes', 'manage'))::uuid[]))
  );

alter policy "discount_codes insert" on public.discount_codes
  with check (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or event_id = any ((select public.event_access_ids('discount_codes', 'manage'))::uuid[]))
  );

alter policy "discount_codes select" on public.discount_codes
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'view') or event_id = any ((select public.event_access_ids('discount_codes', 'view'))::uuid[]))
  );

alter policy "discount_codes update" on public.discount_codes
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or event_id = any ((select public.event_access_ids('discount_codes', 'manage'))::uuid[]))
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or event_id = any ((select public.event_access_ids('discount_codes', 'manage'))::uuid[]))
  );

alter policy "event_sponsors delete" on public.event_sponsors
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or event_id = any ((select public.event_access_ids('event_sponsors', 'manage'))::uuid[]))
  );

alter policy "event_sponsors insert" on public.event_sponsors
  with check (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or event_id = any ((select public.event_access_ids('event_sponsors', 'manage'))::uuid[]))
  );

alter policy "event_sponsors select" on public.event_sponsors
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'view') or event_id = any ((select public.event_access_ids('event_sponsors', 'view'))::uuid[]))
  );

alter policy "event_sponsors update" on public.event_sponsors
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or event_id = any ((select public.event_access_ids('event_sponsors', 'manage'))::uuid[]))
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or event_id = any ((select public.event_access_ids('event_sponsors', 'manage'))::uuid[]))
  );

-- Area: staff

alter policy "event_shifts delete" on public.event_shifts
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or event_id = any ((select public.event_access_ids('event_shifts', 'manage'))::uuid[]))
  );

alter policy "event_shifts insert" on public.event_shifts
  with check (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or event_id = any ((select public.event_access_ids('event_shifts', 'manage'))::uuid[]))
  );

alter policy "event_shifts select" on public.event_shifts
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'view') or event_id = any ((select public.event_access_ids('event_shifts', 'view'))::uuid[]))
  );

alter policy "event_shifts update" on public.event_shifts
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or event_id = any ((select public.event_access_ids('event_shifts', 'manage'))::uuid[]))
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or event_id = any ((select public.event_access_ids('event_shifts', 'manage'))::uuid[]))
  );

alter policy "event_staff delete" on public.event_staff
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or event_id = any ((select public.event_access_ids('event_staff', 'manage'))::uuid[]))
  );

alter policy "event_staff insert" on public.event_staff
  with check (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or event_id = any ((select public.event_access_ids('event_staff', 'manage'))::uuid[]))
  );

alter policy "event_staff select" on public.event_staff
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'view') or event_id = any ((select public.event_access_ids('event_staff', 'view'))::uuid[]))
  );

alter policy "event_staff update" on public.event_staff
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or event_id = any ((select public.event_access_ids('event_staff', 'manage'))::uuid[]))
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or event_id = any ((select public.event_access_ids('event_staff', 'manage'))::uuid[]))
  );

alter policy "event_volunteers delete" on public.event_volunteers
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or event_id = any ((select public.event_access_ids('event_volunteers', 'manage'))::uuid[]))
  );

alter policy "event_volunteers insert" on public.event_volunteers
  with check (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or event_id = any ((select public.event_access_ids('event_volunteers', 'manage'))::uuid[]))
  );

alter policy "event_volunteers select" on public.event_volunteers
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'view') or event_id = any ((select public.event_access_ids('event_volunteers', 'view'))::uuid[]))
  );

alter policy "event_volunteers update" on public.event_volunteers
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or event_id = any ((select public.event_access_ids('event_volunteers', 'manage'))::uuid[]))
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('events', 'manage') or event_id = any ((select public.event_access_ids('event_volunteers', 'manage'))::uuid[]))
  );

alter policy "reviewers read volunteer hour submissions" on public.volunteer_hour_submissions
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('volunteers', 'view') or event_id = any ((select public.event_access_ids('volunteer_hour_submissions', 'view'))::uuid[]))
  );

alter policy "volunteer_hours delete" on public.volunteer_hours
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('volunteers', 'manage') or ((event_id is not null) and (public.has_permission('event_volunteer_hours', 'manage') or event_id = any ((select public.event_access_ids('volunteer_hours', 'manage'))::uuid[]))))
  );

alter policy "volunteer_hours insert" on public.volunteer_hours
  with check (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('volunteers', 'manage') or public.has_permission('volunteer_hours_logging', 'manage') or ((event_id is not null) and (public.has_permission('event_volunteer_hours', 'manage') or event_id = any ((select public.event_access_ids('volunteer_hours', 'manage'))::uuid[]))))
  );

alter policy "volunteer_hours select" on public.volunteer_hours
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('volunteers', 'view') or ((event_id is not null) and (public.has_permission('event_volunteer_hours', 'view') or event_id = any ((select public.event_access_ids('volunteer_hours', 'view'))::uuid[]))))
  );

alter policy "volunteer_hours update" on public.volunteer_hours
  using (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('volunteers', 'manage') or ((event_id is not null) and (public.has_permission('event_volunteer_hours', 'manage') or event_id = any ((select public.event_access_ids('volunteer_hours', 'manage'))::uuid[]))))
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and (public.has_permission('volunteers', 'manage') or ((event_id is not null) and (public.has_permission('event_volunteer_hours', 'manage') or event_id = any ((select public.event_access_ids('volunteer_hours', 'manage'))::uuid[]))))
  );

-- ---------------------------------------------------------------------------
-- 3. Event-scoped functions
-- ---------------------------------------------------------------------------
--
-- Each security definer function that acts on one event now asks
-- has_event_access() of that event and the table it writes or reads, where
-- it asked has_permission('events', ...) before; the event comes from the
-- argument, or from the registration, giveaway, prize, sponsor or upload link
-- it names. Bodies are otherwise unchanged. The carpool writers
-- (delete_event_carpool_car, set_event_carpool_passengers,
-- set_carpool_passenger_paid) need no edit: they already go through
-- carpool_event_guard(), and their own has_permission() only picks the error
-- for a car that does not exist.
--
-- set_event_media_public() takes ids from several events, so it asks of each.

CREATE OR REPLACE FUNCTION public.can_upload_event_media(p_event_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p_event_id is not null
     and not public.current_tenant_is_demo()
     and public.tenant_event_media_uploads_enabled((select public.current_tenant_id()))
     and exists (
       select 1 from public.events e
        where e.id = p_event_id
          and e.tenant_id = (select public.current_tenant_id())
     )
     and (
       public.has_event_access(p_event_id, 'event_media', 'manage')
       or (public.has_event_access(p_event_id, 'event_media', 'view') and public.is_on_event_staff(p_event_id))
     );
$function$;

CREATE OR REPLACE FUNCTION public.can_write_event_retro(p_event_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select public.has_event_access(p_event_id, 'event_retro_items', 'manage')
      or (public.has_event_access(p_event_id, 'event_retro_items', 'view') and public.is_on_event_staff(p_event_id));
$function$;

CREATE OR REPLACE FUNCTION public.cancel_event_registration(p_registration_id uuid, p_reason text, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tenant_id uuid := (select public.current_tenant_id());
  v_registration record;
begin
  if not public.has_event_access((select r.event_id from public.event_registrations r where r.id = p_registration_id), 'event_registrations', 'manage') then
    raise exception 'Not authorized to cancel registrations';
  end if;

  if p_reason is null or p_reason not in ('not_attending', 'mistake', 'duplicate', 'other') then
    raise exception 'CANCELLATION_REASON_INVALID';
  end if;

  if char_length(btrim(coalesce(p_note, ''))) > 500 then
    raise exception 'CANCELLATION_NOTE_TOO_LONG';
  end if;

  select cancelled_at, checked_in_at
    into v_registration
    from public.event_registrations
   where id = p_registration_id
     and tenant_id = v_tenant_id
     for update;

  if not found then
    raise exception 'REGISTRANT_NOT_FOUND';
  end if;

  if v_registration.cancelled_at is not null then
    raise exception 'REGISTRATION_ALREADY_CANCELLED';
  end if;

  if v_registration.checked_in_at is not null then
    raise exception 'REGISTRATION_CHECKED_IN';
  end if;

  perform public.apply_registration_cancellation(v_tenant_id, p_registration_id, p_reason, p_note);
end;
$function$;

CREATE OR REPLACE FUNCTION public.carpool_event_guard(p_event_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tenant_id uuid := (select public.current_tenant_id());
  v_enabled boolean;
begin
  if not public.has_event_access(p_event_id, 'event_carpool_cars', 'manage') then
    raise exception 'Not authorized to organize carpools';
  end if;

  select e.carpools_enabled
    into v_enabled
    from public.events e
   where e.id = p_event_id
     and e.tenant_id = v_tenant_id;

  if not found then
    raise exception 'EVENT_NOT_FOUND';
  end if;
  if not v_enabled then
    raise exception 'CARPOOLS_DISABLED';
  end if;
  return v_tenant_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_event_media_upload_link(p_event_id uuid, p_label text, p_token_hash text, p_expires_at timestamp with time zone, p_max_bytes bigint)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tenant_id uuid := (select public.current_tenant_id());
  v_id uuid;
begin
  if v_tenant_id is null
     or not public.has_event_access(p_event_id, 'event_media_upload_links', 'manage')
     or public.current_tenant_is_demo() then
    raise exception 'PERMISSION_DENIED';
  end if;

  if not public.tenant_event_media_uploads_enabled(v_tenant_id) then
    raise exception 'UPLOADS_DISABLED';
  end if;

  if not exists (
    select 1 from public.events e
     where e.id = p_event_id and e.tenant_id = v_tenant_id
  ) then
    raise exception 'EVENT_NOT_FOUND';
  end if;

  if p_expires_at is null
     or p_expires_at <= now()
     or p_expires_at > now() + interval '1 year' then
    raise exception 'INVALID_EXPIRY';
  end if;

  insert into public.event_media_upload_links (
    tenant_id, event_id, label, token_hash, expires_at, max_bytes, created_by
  )
  values (
    v_tenant_id, p_event_id, btrim(coalesce(p_label, '')), p_token_hash,
    p_expires_at, coalesce(p_max_bytes, 53687091200), auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_event_sponsor(p_event_id uuid, p_person_id uuid, p_support_type text, p_contribution_value numeric, p_is_public boolean, p_notes text, p_follow_up_status text, p_follow_up_notes text, p_items jsonb DEFAULT '[]'::jsonb, p_follow_up_owner_person_id uuid DEFAULT NULL::uuid, p_follow_up_due_date date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_sponsor_id uuid;
  v_tenant_id uuid := public.current_tenant_id();
begin
  if not public.has_event_access(p_event_id, 'event_sponsors', 'manage') then
    raise exception 'Not authorized to manage sponsors';
  end if;

  if not exists (select 1 from public.events where id = p_event_id and tenant_id = v_tenant_id) then
    raise exception 'Event not found';
  end if;
  if not exists (select 1 from public.people where id = p_person_id and tenant_id = v_tenant_id) then
    raise exception 'No such person';
  end if;

  insert into public.event_sponsors (
    event_id, person_id, support_type, contribution_value,
    is_public, notes, follow_up_status, follow_up_notes,
    follow_up_owner_person_id, follow_up_due_date
  )
  values (
    p_event_id, p_person_id, p_support_type, p_contribution_value,
    p_is_public, p_notes, p_follow_up_status, p_follow_up_notes,
    p_follow_up_owner_person_id, p_follow_up_due_date
  )
  returning id into v_sponsor_id;

  perform public.sync_event_sponsor_donations(v_sponsor_id, p_items);

  return v_sponsor_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_giveaway_prize(p_giveaway_id uuid, p_prize_name text, p_donor_person_id uuid DEFAULT NULL::uuid, p_estimated_value numeric DEFAULT NULL::numeric, p_notes text DEFAULT NULL::text, p_source_inventory_item_id uuid DEFAULT NULL::uuid, p_source_monetary_donation_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_event_id uuid;
  v_prize_id uuid;
begin
  if not public.has_event_access((select g.event_id from public.giveaways g where g.id = p_giveaway_id), 'giveaway_prizes', 'manage') then
    raise exception 'Not authorized to manage this giveaway';
  end if;

  select event_id into v_event_id
  from public.giveaways
  where id = p_giveaway_id
    and tenant_id = (select public.current_tenant_id());

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
$function$;

CREATE OR REPLACE FUNCTION public.delete_event_sponsor(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_donation_id uuid;
  v_monetary_donation_id uuid;
begin
  if not public.has_event_access((select s.event_id from public.event_sponsors s where s.id = p_id), 'event_sponsors', 'manage') then
    raise exception 'Not authorized to manage sponsors';
  end if;

  select donation_id, monetary_donation_id
  into v_donation_id, v_monetary_donation_id
  from public.event_sponsors
  where id = p_id
    and tenant_id = (select public.current_tenant_id());

  if not found then
    return;
  end if;

  if v_donation_id is not null then
    -- Same guard as an edit: removing a sponsor whose gear is already a prize
    -- or already went out the door fails loudly instead of emptying the prize.
    perform public.delete_sponsor_inventory_items(v_donation_id, array[]::uuid[]);
    delete from public.donations where id = v_donation_id;
  end if;

  if v_monetary_donation_id is not null then
    delete from public.monetary_donations where id = v_monetary_donation_id;
  end if;

  delete from public.event_sponsors where id = p_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.delete_giveaway_prize(p_prize_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_event_id uuid;
  v_item_id uuid;
begin
  if not public.has_event_access((select g.event_id from public.giveaway_prizes p join public.giveaways g on g.id = p.giveaway_id where p.id = p_prize_id), 'giveaway_prizes', 'manage') then
    raise exception 'Not authorized to manage this giveaway';
  end if;

  select g.event_id, gp.source_inventory_item_id
  into v_event_id, v_item_id
  from public.giveaway_prizes gp
  join public.giveaways g on g.id = gp.giveaway_id
  where gp.id = p_prize_id
    and gp.tenant_id = (select public.current_tenant_id());

  if not found then
    return;
  end if;

  delete from public.giveaway_prizes where id = p_prize_id;

  perform public.release_inventory_item_from_giveaway(v_item_id, v_event_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.event_carpool_markers(p_event_id uuid)
 RETURNS TABLE(user_id uuid, name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select distinct on (p.paid_marked_by)
         p.paid_marked_by,
         coalesce(
           (select coalesce(pe.preferred_name, pe.name)
              from public.people pe
             where pe.auth_user_id = p.paid_marked_by
               and pe.tenant_id = p.tenant_id
             limit 1),
           (select coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name')
              from auth.users u
             where u.id = p.paid_marked_by)
         )
    from public.event_carpool_passengers p
   where p.event_id = p_event_id
     and p.tenant_id = (select public.current_tenant_id())
     and p.paid_marked_by is not null
     and public.has_event_access(p_event_id, 'event_carpool_cars', 'view')
   order by p.paid_marked_by;
$function$;

CREATE OR REPLACE FUNCTION public.event_group_chat_adders(p_event_id uuid)
 RETURNS TABLE(user_id uuid, name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select distinct on (r.group_chat_added_by)
         r.group_chat_added_by,
         coalesce(
           (select coalesce(p.preferred_name, p.name)
              from public.people p
             where p.auth_user_id = r.group_chat_added_by
               and p.tenant_id = r.tenant_id
             limit 1),
           (select coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name')
              from auth.users u
             where u.id = r.group_chat_added_by)
         )
    from public.event_registrations r
   where r.event_id = p_event_id
     and r.tenant_id = (select public.current_tenant_id())
     and r.group_chat_added_by is not null
     and public.has_event_access(p_event_id, 'event_registrations', 'view')
   order by r.group_chat_added_by;
$function$;

CREATE OR REPLACE FUNCTION public.event_media_event_expires_at(p_event_id uuid)
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.event_media_expiry((select public.current_tenant_id()), p_event_id, null)
   where public.has_event_access(p_event_id, 'event_media', 'view');
$function$;

CREATE OR REPLACE FUNCTION public.event_media_retention_days()
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.has_any_event_access('event_media', 'view') then
    raise exception 'PERMISSION_DENIED';
  end if;
  return public.tenant_event_media_retention_days((select public.current_tenant_id()));
end;
$function$;

CREATE OR REPLACE FUNCTION public.event_media_uploads_enabled()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case
    when public.has_any_event_access('event_media', 'view')
      then public.tenant_event_media_uploads_enabled((select public.current_tenant_id()))
  end;
$function$;

CREATE OR REPLACE FUNCTION public.event_public_gallery_enabled()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case
    when public.has_any_event_access('event_media', 'view')
      then public.tenant_event_public_gallery_enabled((select public.current_tenant_id()))
  end;
$function$;

CREATE OR REPLACE FUNCTION public.event_reminder_status(p_event_id uuid)
 RETURNS TABLE(send_at timestamp with time zone, recipients integer, sent integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with e as (
    select ev.id, ev.tenant_id,
           public.event_reminder_send_at(ev.starts_at, ev.timezone, ev.reminder_days_before) as send_at
      from public.events ev
     where ev.id = p_event_id
       and ev.tenant_id = (select public.current_tenant_id())
       and public.has_event_access(p_event_id, 'event_registrations', 'view')
  )
  select e.send_at,
         count(r.id) filter (where r.created_at < e.send_at)::integer,
         count(r.id) filter (where r.created_at < e.send_at and r.reminder_sent_at is not null)::integer
    from e
    left join public.event_registrations r
      on r.event_id = e.id
     and r.tenant_id = e.tenant_id
     and r.cancelled_at is null
     and nullif(btrim(coalesce(r.email, '')), '') is not null
   group by e.send_at;
$function$;

CREATE OR REPLACE FUNCTION public.get_giveaway_prize_sources(p_giveaway_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_result jsonb;
begin
  if not public.has_event_access((select g.event_id from public.giveaways g where g.id = p_giveaway_id), 'giveaway_prizes', 'view') then
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
    and gp.tenant_id = (select public.current_tenant_id())
    and (gp.source_inventory_item_id is not null or gp.source_monetary_donation_id is not null);

  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.giveaway_ticket_totals(p_giveaway_id uuid, p_donation_id uuid DEFAULT NULL::uuid, p_sale_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(tier_id uuid, tier_key text, tier_label text, tier_rank integer, quantity bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select t.id, t.key, t.label, t.rank, coalesce(sum(g.quantity), 0)::bigint
  from public.giveaway_tiers t
  left join public.giveaway_ticket_grants g
    on g.ticket_tier_id = t.id
   and (p_donation_id is null or g.donation_id = p_donation_id)
   and (p_sale_id is null or g.sale_id = p_sale_id)
  where t.giveaway_id = p_giveaway_id
    and t.tenant_id = (select public.current_tenant_id())
    and public.has_event_access((select g.event_id from public.giveaways g where g.id = p_giveaway_id), 'giveaway_ticket_grants', 'view')
  group by t.id, t.key, t.label, t.rank
  order by t.rank;
$function$;

CREATE OR REPLACE FUNCTION public.list_available_giveaway_sources(p_event_id uuid, p_include_prize_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_result jsonb;
  v_tenant_id uuid := public.current_tenant_id();
begin
  if not public.has_event_access(p_event_id, 'giveaway_prizes', 'manage') then
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
        and d.tenant_id = v_tenant_id
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
        and md.tenant_id = v_tenant_id
        and not exists (
          select 1 from public.giveaway_prizes gp
          where gp.source_monetary_donation_id = md.id
            and (p_include_prize_id is null or gp.id <> p_include_prize_id)
        )
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_event_sponsor_items(p_event_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_result jsonb;
begin
  if not public.has_event_access(p_event_id, 'event_sponsors', 'view') then
    raise exception 'Not authorized to view sponsor items';
  end if;

  select coalesce(jsonb_object_agg(t.sponsor_id, t.items), '{}'::jsonb)
    into v_result
  from (
    select es.id::text as sponsor_id,
           jsonb_agg(
             jsonb_build_object(
               'id', ii.id,
               'description', ii.description,
               'face_value', ii.face_value,
               'intended_use', ii.intended_use,
               'status', ii.status,
               -- Lets the tab disable removal of an item the giveaway already
               -- claims, rather than letting the staffer hit the exception.
               'allocated', exists (
                 select 1 from public.giveaway_prizes gp
                 where gp.source_inventory_item_id = ii.id
               )
             )
             order by ii.created_at, ii.id
           ) as items
    from public.event_sponsors es
    join public.inventory_items ii on ii.donation_id = es.donation_id
    where es.event_id = p_event_id
      and es.tenant_id = (select public.current_tenant_id())
    group by es.id
  ) t;

  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_expense_actors(p_user_ids uuid[])
 RETURNS TABLE(user_id uuid, email text, full_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select u.id, u.email,
    coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name')
  from auth.users u
  where public.has_any_event_access('event_expenses', 'view')
    and u.id = any(p_user_ids)
    and (
      exists (
        select 1 from public.event_expenses e
         where e.tenant_id = (select public.current_tenant_id())
           and u.id in (e.submitted_by, e.approved_by, e.paid_by, e.rejected_by, e.created_by, e.updated_by)
      )
      or exists (
        select 1 from public.reimbursements r
         where r.tenant_id = (select public.current_tenant_id())
           and u.id in (r.submitted_by, r.approved_by, r.paid_by, r.created_by, r.updated_by)
      )
    );
$function$;

CREATE OR REPLACE FUNCTION public.publish_giveaway_rules(p_giveaway_id uuid, p_content jsonb)
 RETURNS TABLE(version integer, effective_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tenant_id uuid := (select public.current_tenant_id());
  v_rules_id uuid;
  v_version integer;
  v_effective timestamptz := now();
begin
  if not public.has_event_access((select g.event_id from public.giveaways g where g.id = p_giveaway_id), 'giveaway_rules', 'manage') then
    raise exception 'Not authorized to publish official rules';
  end if;

  if jsonb_typeof(p_content) is distinct from 'object'
     or coalesce(jsonb_array_length(p_content -> 'sections'), 0) = 0 then
    raise exception 'EMPTY_RULES';
  end if;

  -- The rules row may not exist yet: publishing a promotion whose sections all
  -- come from the template and the numbers is a legitimate first act.
  insert into public.giveaway_rules (tenant_id, giveaway_id)
  select v_tenant_id, p_giveaway_id
  where exists (
    select 1 from public.giveaways g
    where g.id = p_giveaway_id and g.tenant_id = v_tenant_id
  )
  on conflict (tenant_id, giveaway_id) do nothing;

  select id into v_rules_id
  from public.giveaway_rules
  where giveaway_id = p_giveaway_id and tenant_id = v_tenant_id;

  if v_rules_id is null then
    raise exception 'GIVEAWAY_NOT_FOUND';
  end if;

  select coalesce(max(v.version), 0) + 1 into v_version
  from public.giveaway_rules_versions v
  where v.giveaway_rules_id = v_rules_id and v.tenant_id = v_tenant_id;

  -- The effective date the document prints and the one the row carries are
  -- the same instant, taken here. The application cannot supply it: its clock
  -- is a different clock, and a set of rules whose printed date disagrees with
  -- its own row is the kind of discrepancy this table exists to rule out.
  insert into public.giveaway_rules_versions
    (tenant_id, giveaway_rules_id, version, content, effective_at)
  values (
    v_tenant_id,
    v_rules_id,
    v_version,
    jsonb_set(p_content, '{effective_at}', to_jsonb(v_effective)),
    v_effective
  );

  return query select v_version, v_effective;
end;
$function$;

CREATE OR REPLACE FUNCTION public.record_giveaway_ticket_sale(p_giveaway_id uuid, p_package_id uuid, p_quantity integer, p_purchaser_person_id uuid DEFAULT NULL::uuid, p_sold_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_notes text DEFAULT NULL::text)
 RETURNS TABLE(sale_id uuid, amount numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_price numeric(10, 2);
  v_tier_id uuid;
  v_bundle integer;
  v_is_active boolean;
  v_sale_id uuid;
  v_amount numeric(10, 2);
begin
  if not public.has_event_access((select g.event_id from public.giveaways g where g.id = p_giveaway_id), 'giveaway_ticket_sales', 'manage') then
    raise exception 'Not authorized to record a ticket sale';
  end if;

  if p_quantity is null or p_quantity < 1 then
    raise exception 'Quantity must be at least 1';
  end if;

  select price, tier_id, bundle_quantity, is_active
  into v_price, v_tier_id, v_bundle, v_is_active
  from public.giveaway_ticket_packages
  where id = p_package_id
    and giveaway_id = p_giveaway_id
    and tenant_id = (select public.current_tenant_id());

  if not found then
    raise exception 'Ticket package does not belong to this giveaway';
  end if;

  if not v_is_active then
    raise exception 'Ticket package is no longer on sale';
  end if;

  v_amount := v_price * p_quantity;

  insert into public.giveaway_ticket_sales (
    giveaway_id, package_id, purchaser_person_id, quantity, unit_price, amount, sold_at, notes
  )
  values (
    p_giveaway_id, p_package_id, p_purchaser_person_id, p_quantity, v_price, v_amount,
    coalesce(p_sold_at, now()), p_notes
  )
  returning id into v_sale_id;

  perform public.grant_giveaway_tickets(
    p_giveaway_id, v_tier_id, v_bundle * p_quantity, null, null, v_sale_id
  );

  return query select v_sale_id, v_amount;
end;
$function$;

CREATE OR REPLACE FUNCTION public.registration_asks_about_minors()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case
    when public.has_any_event_access('event_registrations', 'manage')
      then public.tenant_asks_about_minors((select public.current_tenant_id()))
  end;
$function$;

CREATE OR REPLACE FUNCTION public.registration_requires_instagram()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case
    when public.has_any_event_access('event_registrations', 'manage')
      then public.tenant_requires_instagram((select public.current_tenant_id()))
  end;
$function$;

CREATE OR REPLACE FUNCTION public.request_registration_answers(p_event_id uuid, p_requests jsonb)
 RETURNS TABLE(registration_id uuid, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tenant_id uuid := (select public.current_tenant_id());
  v_event record;
  v_expires_at timestamptz;
begin
  if not public.has_event_access(p_event_id, 'event_registrations', 'manage') then
    raise exception 'Not authorized to message registrants';
  end if;

  select e.starts_at, e.ends_at
    into v_event
    from public.events e
   where e.id = p_event_id
     and e.tenant_id = v_tenant_id;

  if not found then
    raise exception 'EVENT_NOT_FOUND';
  end if;

  v_expires_at := coalesce(v_event.ends_at, v_event.starts_at + interval '1 day');
  if v_expires_at <= now() then
    raise exception 'EVENT_ENDED';
  end if;

  if p_requests is null
     or jsonb_typeof(p_requests) <> 'array'
     or exists (
       select 1
         from jsonb_array_elements(p_requests) r
        where jsonb_typeof(r) <> 'object'
           or coalesce(r->>'registration_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           or coalesce(r->>'token_hash', '') !~ '^[0-9a-f]{64}$'
     ) then
    raise exception 'ANSWER_REQUESTS_INVALID';
  end if;

  return query
    insert into public.event_registration_answer_requests as a
      (tenant_id, registration_id, token_hash, expires_at, requested_at, requested_by, source)
    select distinct on (reg.id)
           v_tenant_id, reg.id, r->>'token_hash', v_expires_at, now(), auth.uid(), 'staff'
      from jsonb_array_elements(p_requests) r
      join public.event_registrations reg
        on reg.id = (r->>'registration_id')::uuid
       and reg.tenant_id = v_tenant_id
       and reg.event_id = p_event_id
       and reg.cancelled_at is null
    on conflict on constraint event_registration_answer_requests_registration_key
    do update set
      token_hash = excluded.token_hash,
      expires_at = excluded.expires_at,
      requested_at = excluded.requested_at,
      requested_by = excluded.requested_by,
      source = excluded.source
    returning a.registration_id, a.expires_at;
end;
$function$;

CREATE OR REPLACE FUNCTION public.restore_event_registration(p_registration_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tenant_id uuid := (select public.current_tenant_id());
  v_registration record;
  v_event record;
  v_taken bigint;
begin
  if not public.has_event_access((select r.event_id from public.event_registrations r where r.id = p_registration_id), 'event_registrations', 'manage') then
    raise exception 'Not authorized to restore registrations';
  end if;

  select r.event_id, r.party_size, r.cancelled_at
    into v_registration
    from public.event_registrations r
   where r.id = p_registration_id
     and r.tenant_id = v_tenant_id;

  if not found then
    raise exception 'REGISTRANT_NOT_FOUND';
  end if;

  if v_registration.cancelled_at is null then
    raise exception 'REGISTRATION_NOT_CANCELLED';
  end if;

  -- The lock the registration RPCs take, so an undo and a registration racing
  -- for the last seat queue behind each other.
  select capacity, auto_assign_discount_codes
    into v_event
    from public.events
   where id = v_registration.event_id
     and tenant_id = v_tenant_id
     for update;

  if v_event.capacity is not null then
    select coalesce(sum(party_size), 0) into v_taken
      from public.event_registrations
     where event_id = v_registration.event_id
       and cancelled_at is null;

    if v_taken + v_registration.party_size > v_event.capacity then
      raise exception 'EVENT_AT_CAPACITY';
    end if;
  end if;

  if exists (
    select 1
      from public.event_registration_option_counts mine
      join public.event_registration_options o
        on o.id = mine.option_id and o.tenant_id = mine.tenant_id
     where mine.registration_id = p_registration_id
       and o.cap is not null
       and mine.quantity + coalesce((
             select sum(c.quantity)
               from public.event_registration_option_counts c
               join public.event_registrations r on r.id = c.registration_id
              where c.option_id = o.id
                and r.cancelled_at is null
           ), 0) > o.cap
  ) then
    raise exception 'EVENT_OPTION_FULL';
  end if;

  update public.event_registrations
     set cancelled_at = null,
         cancelled_by = null,
         cancellation_reason = null,
         cancellation_note = null
   where id = p_registration_id
     and tenant_id = v_tenant_id;

  -- Its released code went back to the pool; a fresh one, where the event
  -- hands them out and it holds none.
  if v_event.auto_assign_discount_codes and not exists (
    select 1 from public.discount_codes where registration_id = p_registration_id
  ) then
    update public.discount_codes
       set registration_id = p_registration_id,
           assigned_at = now()
     where id = (
       select id
         from public.discount_codes
        where event_id = v_registration.event_id
          and tenant_id = v_tenant_id
          and registration_id is null
          -- #1589: the shared code is everyone's, never one registration's.
          and not shared
        order by created_at asc
        for update skip locked
        limit 1
     );
  end if;
exception
  when unique_violation then
    -- The same person or address registered again after this was cancelled.
    raise exception 'ALREADY_REGISTERED';
end;
$function$;

CREATE OR REPLACE FUNCTION public.revoke_event_media_upload_link(p_link_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.has_event_access((select l.event_id from public.event_media_upload_links l where l.id = p_link_id), 'event_media_upload_links', 'manage') then
    raise exception 'PERMISSION_DENIED';
  end if;

  update public.event_media_upload_links
     set revoked_at = coalesce(revoked_at, now())
   where id = p_link_id
     and tenant_id = (select public.current_tenant_id());

  if not found then
    raise exception 'LINK_NOT_FOUND';
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_event_registration_options(p_event_id uuid, p_prompt text, p_options jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tenant_id uuid := (select public.current_tenant_id());
  v_prompt text := nullif(btrim(coalesce(p_prompt, '')), '');
  v_option jsonb;
  v_index integer := 0;
  v_id uuid;
  v_label text;
  v_cap integer;
  v_price numeric;
  v_kept uuid[] := '{}';
begin
  if not public.has_event_access(p_event_id, 'event_registration_options', 'manage') then
    raise exception 'Not authorized to edit events';
  end if;

  perform 1 from public.events
   where id = p_event_id and tenant_id = v_tenant_id
   for update;
  if not found then
    raise exception 'EVENT_NOT_FOUND';
  end if;

  if p_options is null or jsonb_typeof(p_options) <> 'array' then
    raise exception 'EVENT_OPTIONS_INVALID';
  end if;

  if jsonb_array_length(p_options) > 10 then
    raise exception 'EVENT_OPTIONS_TOO_MANY';
  end if;

  if jsonb_array_length(p_options) > 0 and v_prompt is null then
    raise exception 'EVENT_OPTIONS_PROMPT_REQUIRED';
  end if;

  if (select count(distinct lower(btrim(o->>'label'))) from jsonb_array_elements(p_options) o)
     <> jsonb_array_length(p_options) then
    raise exception 'EVENT_OPTIONS_DUPLICATE';
  end if;

  for v_option in select value from jsonb_array_elements(p_options) loop
    v_label := btrim(coalesce(v_option->>'label', ''));
    if v_label = '' or char_length(v_label) > 120 then
      raise exception 'EVENT_OPTIONS_INVALID';
    end if;

    if v_option->'cap' is null or jsonb_typeof(v_option->'cap') = 'null' then
      v_cap := null;
    elsif (case when jsonb_typeof(v_option->'cap') = 'number'
                then (v_option->>'cap')::numeric = trunc((v_option->>'cap')::numeric)
                     and (v_option->>'cap')::numeric between 0 and 100000
                else false
           end) then
      v_cap := (v_option->>'cap')::numeric::integer;
    else
      raise exception 'EVENT_OPTIONS_INVALID';
    end if;

    -- #1589
    if v_option->'price' is null or jsonb_typeof(v_option->'price') = 'null' then
      v_price := null;
    elsif (case when jsonb_typeof(v_option->'price') = 'number'
                then (v_option->>'price')::numeric between 0 and 99999999.99
                     and (v_option->>'price')::numeric = round((v_option->>'price')::numeric, 2)
                else false
           end) then
      v_price := (v_option->>'price')::numeric;
    else
      raise exception 'EVENT_OPTIONS_INVALID';
    end if;

    v_id := null;
    if nullif(v_option->>'id', '') is not null then
      update public.event_registration_options
         set label = v_label, cap = v_cap, price = v_price, sort_order = v_index
       where id::text = lower(v_option->>'id')
         and event_id = p_event_id
         and tenant_id = v_tenant_id
      returning id into v_id;
    end if;

    if v_id is null then
      insert into public.event_registration_options (tenant_id, event_id, label, cap, price, sort_order)
      values (v_tenant_id, p_event_id, v_label, v_cap, v_price, v_index)
      returning id into v_id;
    end if;

    v_kept := v_kept || v_id;
    v_index := v_index + 1;
  end loop;

  delete from public.event_registration_options
   where event_id = p_event_id
     and tenant_id = v_tenant_id
     and not (id = any (v_kept));

  update public.events
     set registration_options_prompt = case when v_index = 0 then null else v_prompt end
   where id = p_event_id and tenant_id = v_tenant_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_event_registration_questions(p_event_id uuid, p_questions jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tenant_id uuid := (select public.current_tenant_id());
  v_uuid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_question jsonb;
  v_index integer := 0;
  v_id uuid;
  v_kind text;
  v_prompt text;
  v_help text;
  v_column_label text;
  v_required boolean;
  v_options jsonb;
  v_option jsonb;
  v_label text;
  v_min integer;
  v_max integer;
  v_shares boolean;
  v_show_if jsonb;
  v_parent jsonb;
  v_option_ids jsonb;
  v_seen jsonb := '{}'::jsonb;
  v_kept uuid[] := '{}';
begin
  if not public.has_event_access(p_event_id, 'event_registration_questions', 'manage') then
    raise exception 'Not authorized to edit events';
  end if;

  perform 1 from public.events
   where id = p_event_id and tenant_id = v_tenant_id
   for update;
  if not found then
    raise exception 'EVENT_NOT_FOUND';
  end if;

  if p_questions is null or jsonb_typeof(p_questions) <> 'array' then
    raise exception 'EVENT_QUESTIONS_INVALID';
  end if;

  if jsonb_array_length(p_questions) > 20 then
    raise exception 'EVENT_QUESTIONS_TOO_MANY';
  end if;

  for v_question in select value from jsonb_array_elements(p_questions) loop
    if jsonb_typeof(v_question) <> 'object'
       or coalesce(lower(v_question->>'id'), '') !~ v_uuid then
      raise exception 'EVENT_QUESTIONS_INVALID';
    end if;
    v_id := (v_question->>'id')::uuid;
    if v_id = any (v_kept) then
      raise exception 'EVENT_QUESTIONS_INVALID';
    end if;

    v_kind := v_question->>'kind';
    if v_kind is null or v_kind not in ('single_choice', 'multi_choice', 'short_text', 'number', 'consent') then
      raise exception 'EVENT_QUESTIONS_INVALID';
    end if;

    v_prompt := btrim(coalesce(v_question->>'prompt', ''));
    if v_prompt = '' then
      raise exception 'EVENT_QUESTIONS_PROMPT_REQUIRED';
    end if;
    if char_length(v_prompt) > 300 then
      raise exception 'EVENT_QUESTIONS_INVALID';
    end if;

    v_help := nullif(btrim(coalesce(v_question->>'help', '')), '');
    if char_length(v_help) > 500 then
      raise exception 'EVENT_QUESTIONS_INVALID';
    end if;

    -- #1512. Optional; a key the caller leaves out clears it, like help.
    v_column_label := nullif(btrim(coalesce(v_question->>'column_label', '')), '');
    if char_length(v_column_label) > 24 then
      raise exception 'EVENT_QUESTIONS_COLUMN_LABEL_TOO_LONG';
    end if;

    -- A consent box is declinable by definition, so it is never required:
    -- an unticked box is the answer "no".
    v_required := v_kind <> 'consent' and coalesce(v_question->'required' = 'true'::jsonb, false);
    v_shares := v_kind = 'consent' and coalesce(v_question->'shares_contact' = 'true'::jsonb, false);

    -- Options: the two choice kinds need at least two, distinct by label.
    v_options := '[]'::jsonb;
    if v_kind in ('single_choice', 'multi_choice') then
      if jsonb_typeof(v_question->'options') is distinct from 'array'
         or jsonb_array_length(v_question->'options') < 2
         or jsonb_array_length(v_question->'options') > 20 then
        raise exception 'EVENT_QUESTIONS_OPTIONS_INVALID';
      end if;
      for v_option in select value from jsonb_array_elements(v_question->'options') loop
        v_label := btrim(coalesce(v_option->>'label', ''));
        if jsonb_typeof(v_option) <> 'object'
           or coalesce(lower(v_option->>'id'), '') !~ v_uuid
           or v_label = '' or char_length(v_label) > 120 then
          raise exception 'EVENT_QUESTIONS_OPTIONS_INVALID';
        end if;
        v_options := v_options || jsonb_build_array(
          jsonb_build_object('id', lower(v_option->>'id'), 'label', v_label)
        );
      end loop;
      if (select count(distinct o->>'id') from jsonb_array_elements(v_options) o) <> jsonb_array_length(v_options)
         or (select count(distinct lower(o->>'label')) from jsonb_array_elements(v_options) o) <> jsonb_array_length(v_options) then
        raise exception 'EVENT_QUESTIONS_OPTIONS_INVALID';
      end if;
    end if;

    -- Bounds, for a number only.
    v_min := null;
    v_max := null;
    if v_kind = 'number' then
      if jsonb_typeof(v_question->'min_value') = 'number' then
        if (v_question->>'min_value')::numeric <> trunc((v_question->>'min_value')::numeric)
           or (v_question->>'min_value')::numeric not between -1000000 and 1000000 then
          raise exception 'EVENT_QUESTIONS_INVALID';
        end if;
        v_min := (v_question->>'min_value')::numeric::integer;
      elsif jsonb_typeof(v_question->'min_value') not in ('null') then
        raise exception 'EVENT_QUESTIONS_INVALID';
      end if;
      if jsonb_typeof(v_question->'max_value') = 'number' then
        if (v_question->>'max_value')::numeric <> trunc((v_question->>'max_value')::numeric)
           or (v_question->>'max_value')::numeric not between -1000000 and 1000000 then
          raise exception 'EVENT_QUESTIONS_INVALID';
        end if;
        v_max := (v_question->>'max_value')::numeric::integer;
      elsif jsonb_typeof(v_question->'max_value') not in ('null') then
        raise exception 'EVENT_QUESTIONS_INVALID';
      end if;
      if v_min is not null and v_max is not null and v_min > v_max then
        raise exception 'EVENT_QUESTIONS_INVALID';
      end if;
    end if;

    -- The condition: an EARLIER single-choice question of this save that is
    -- not conditional itself, and some of its options.
    v_show_if := null;
    if v_question->'show_if' is not null and jsonb_typeof(v_question->'show_if') <> 'null' then
      v_parent := v_seen -> lower(coalesce(v_question->'show_if'->>'question_id', ''));
      v_option_ids := v_question->'show_if'->'option_ids';
      if v_parent is null
         or v_parent->>'kind' <> 'single_choice'
         or (v_parent->>'conditional')::boolean
         or jsonb_typeof(v_option_ids) is distinct from 'array'
         or jsonb_array_length(v_option_ids) = 0
         or exists (
           select 1 from jsonb_array_elements(v_option_ids) i
            where jsonb_typeof(i) <> 'string'
               or not exists (
                 select 1 from jsonb_array_elements(v_parent->'options') o
                  where o->>'id' = lower(i #>> '{}')
               )
         ) then
        raise exception 'EVENT_QUESTIONS_CONDITION_INVALID';
      end if;
      v_show_if := jsonb_build_object(
        'question_id', lower(v_question->'show_if'->>'question_id'),
        'option_ids', (select jsonb_agg(distinct lower(i #>> '{}')) from jsonb_array_elements(v_option_ids) i)
      );
    end if;

    update public.event_registration_questions
       set kind = v_kind,
           prompt = v_prompt,
           help = v_help,
           column_label = v_column_label,
           required = v_required,
           sort_order = v_index,
           options = v_options,
           min_value = v_min,
           max_value = v_max,
           show_if = v_show_if,
           shares_contact = v_shares,
           archived_at = null,
           updated_at = now()
     where id = v_id
       and event_id = p_event_id
       and tenant_id = v_tenant_id;

    if not found then
      begin
        insert into public.event_registration_questions
          (id, tenant_id, event_id, kind, prompt, help, column_label, required, sort_order,
           options, min_value, max_value, show_if, shares_contact)
        values
          (v_id, v_tenant_id, p_event_id, v_kind, v_prompt, v_help, v_column_label, v_required, v_index,
           v_options, v_min, v_max, v_show_if, v_shares);
      exception when unique_violation then
        -- The id belongs to another event's question.
        raise exception 'EVENT_QUESTIONS_INVALID';
      end;
    end if;

    v_seen := v_seen || jsonb_build_object(v_id::text, jsonb_build_object(
      'kind', v_kind, 'options', v_options, 'conditional', v_show_if is not null
    ));
    v_kept := v_kept || v_id;
    v_index := v_index + 1;
  end loop;

  -- Left out: archived where somebody answered it, so the answers stay
  -- readable, and gone where nobody did.
  update public.event_registration_questions q
     set archived_at = now(), updated_at = now()
   where q.event_id = p_event_id
     and q.tenant_id = v_tenant_id
     and q.archived_at is null
     and not (q.id = any (v_kept))
     and exists (select 1 from public.event_registration_answers a where a.question_id = q.id);

  delete from public.event_registration_questions q
   where q.event_id = p_event_id
     and q.tenant_id = v_tenant_id
     and not (q.id = any (v_kept))
     and not exists (select 1 from public.event_registration_answers a where a.question_id = q.id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.seed_giveaway_tiers(p_giveaway_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_gold uuid;
  v_silver uuid;
  v_bronze uuid;
begin
  if not public.has_event_access((select g.event_id from public.giveaways g where g.id = p_giveaway_id), 'giveaway_tiers', 'manage') then
    raise exception 'Not authorized to configure a giveaway';
  end if;

  if not exists (
    select 1 from public.giveaways
     where id = p_giveaway_id and tenant_id = (select public.current_tenant_id())
  ) then
    raise exception 'GIVEAWAY_NOT_FOUND';
  end if;

  if exists (select 1 from public.giveaway_tiers where giveaway_id = p_giveaway_id) then
    return;
  end if;

  insert into public.giveaway_tiers (giveaway_id, key, label, rank)
  values (p_giveaway_id, 'gold', 'Gold', 1) returning id into v_gold;
  insert into public.giveaway_tiers (giveaway_id, key, label, rank)
  values (p_giveaway_id, 'silver', 'Silver', 2) returning id into v_silver;
  insert into public.giveaway_tiers (giveaway_id, key, label, rank)
  values (p_giveaway_id, 'bronze', 'Bronze', 3) returning id into v_bronze;

  insert into public.giveaway_tier_grants
    (giveaway_id, source_tier_id, ticket_tier_id, quantity)
  values
    (p_giveaway_id, v_gold, v_gold, 3),
    (p_giveaway_id, v_gold, v_silver, 1),
    (p_giveaway_id, v_gold, v_bronze, 1),
    (p_giveaway_id, v_silver, v_gold, 1),
    (p_giveaway_id, v_silver, v_silver, 3),
    (p_giveaway_id, v_silver, v_bronze, 2),
    (p_giveaway_id, v_bronze, v_gold, 0),
    (p_giveaway_id, v_bronze, v_silver, 1),
    (p_giveaway_id, v_bronze, v_bronze, 3);

  insert into public.giveaway_tier_rules (giveaway_id, tier_id, match_text)
  select p_giveaway_id, v_gold, unnest(array['ski', 'snowboard', 'splitboard'])
  union all
  select p_giveaway_id, v_silver, unnest(array['jacket', 'pant', 'bib', 'outerwear', 'shell'])
  union all
  select p_giveaway_id, v_bronze, unnest(array['beanie', 'thermal', 'helmet cover', 'base layer']);
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_registrant_option_counts(p_registration_id uuid, p_counts jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_registration record;
begin
  if not public.has_event_access((select r.event_id from public.event_registrations r where r.id = p_registration_id), 'event_registrations', 'manage') then
    raise exception 'Not authorized to edit registrations';
  end if;

  select tenant_id, event_id, party_size
    into v_registration
    from public.event_registrations
   where id = p_registration_id
     and tenant_id = (select public.current_tenant_id());

  if not found then
    raise exception 'REGISTRANT_NOT_FOUND';
  end if;

  perform public.apply_registration_option_counts(
    v_registration.tenant_id, v_registration.event_id, p_registration_id,
    v_registration.party_size, p_counts, false, false
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_registrant_rider_profile(p_registration_id uuid, p_riding_discipline text, p_ski_experience_level text DEFAULT NULL::text, p_snowboard_experience_level text DEFAULT NULL::text, p_preferred_mountain text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_person_id uuid;
  v_checked_in timestamptz;
  v_ski text;
  v_snowboard text;
begin
  if not public.has_event_access((select r.event_id from public.event_registrations r where r.id = p_registration_id), 'event_registrations', 'manage')
     or not public.has_permission('rider_profiles', 'manage') then
    raise exception 'Not authorized to edit registrant rider profiles';
  end if;

  if p_riding_discipline not in ('ski', 'snowboard', 'both') then
    raise exception 'INVALID_RIDER_PROFILE';
  end if;

  v_ski := case when p_riding_discipline in ('ski', 'both') then p_ski_experience_level end;
  v_snowboard := case when p_riding_discipline in ('snowboard', 'both') then p_snowboard_experience_level end;

  if p_riding_discipline in ('ski', 'both')
     and (v_ski is null or v_ski not in ('first_time', 'beginner', 'intermediate', 'advanced')) then
    raise exception 'INVALID_RIDER_PROFILE';
  end if;
  if p_riding_discipline in ('snowboard', 'both')
     and (v_snowboard is null or v_snowboard not in ('first_time', 'beginner', 'intermediate', 'advanced')) then
    raise exception 'INVALID_RIDER_PROFILE';
  end if;

  select person_id, checked_in_at into v_person_id, v_checked_in
  from public.event_registrations
  where id = p_registration_id
    and tenant_id = (select public.current_tenant_id());

  if v_person_id is null then
    raise exception 'REGISTRANT_NOT_FOUND';
  end if;

  update public.people
  set riding_discipline = p_riding_discipline,
      ski_experience_level = v_ski,
      snowboard_experience_level = v_snowboard,
      preferred_mountain = nullif(btrim(coalesce(p_preferred_mountain, '')), '')
  where id = v_person_id;

  if v_checked_in is not null then
    update public.event_registrations
    set riding_discipline_at_event = p_riding_discipline,
        ski_experience_level_at_event = v_ski,
        snowboard_experience_level_at_event = v_snowboard
    where id = p_registration_id;
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_registration_answers(p_registration_id uuid, p_answers jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_registration record;
begin
  if not public.has_event_access((select r.event_id from public.event_registrations r where r.id = p_registration_id), 'event_registrations', 'manage') then
    raise exception 'Not authorized to edit registrations';
  end if;

  select tenant_id, event_id
    into v_registration
    from public.event_registrations
   where id = p_registration_id
     and tenant_id = (select public.current_tenant_id());

  if not found then
    raise exception 'REGISTRANT_NOT_FOUND';
  end if;

  perform public.apply_registration_answers(
    v_registration.tenant_id, v_registration.event_id, p_registration_id, p_answers, false
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_registration_contact(p_registration_id uuid, p_instagram_handle text, p_has_no_instagram boolean, p_preferred_contact_method text, p_preferred_contact_detail text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tenant_id uuid := (select public.current_tenant_id());
  v_contact public.registration_contact;
begin
  if not public.has_event_access((select r.event_id from public.event_registrations r where r.id = p_registration_id), 'event_registrations', 'manage') or v_tenant_id is null then
    raise exception 'PERMISSION_DENIED';
  end if;

  v_contact := public.resolve_registration_contact(
    true, false,
    p_instagram_handle, p_has_no_instagram, p_preferred_contact_method, p_preferred_contact_detail
  );

  update public.event_registrations
     set instagram_handle = v_contact.instagram_handle,
         has_no_instagram = v_contact.has_no_instagram,
         preferred_contact_method = v_contact.preferred_contact_method,
         preferred_contact_detail = v_contact.preferred_contact_detail
   where id = p_registration_id
     and tenant_id = v_tenant_id;

  if not found then
    raise exception 'REGISTRATION_NOT_FOUND';
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_registrations_group_chat(p_event_id uuid, p_registration_ids uuid[], p_added boolean)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tenant_id uuid := (select public.current_tenant_id());
  v_enabled boolean;
  v_changed integer;
begin
  if not public.has_event_access(p_event_id, 'event_registrations', 'manage') then
    raise exception 'Not authorized to update registrations';
  end if;

  if p_added is null then
    raise exception 'GROUP_CHAT_VALUE_REQUIRED';
  end if;

  select e.group_chat_enabled
    into v_enabled
    from public.events e
   where e.id = p_event_id
     and e.tenant_id = v_tenant_id;

  if not found then
    raise exception 'EVENT_NOT_FOUND';
  end if;

  if not v_enabled then
    raise exception 'GROUP_CHAT_DISABLED';
  end if;

  if coalesce(cardinality(p_registration_ids), 0) = 0 then
    return 0;
  end if;

  -- All or nothing: one id from another event, or another tenant, refuses
  -- the whole call rather than marking the rest.
  if exists (
    select 1
      from unnest(p_registration_ids) as ids(id)
     where not exists (
       select 1 from public.event_registrations r
        where r.id = ids.id
          and r.event_id = p_event_id
          and r.tenant_id = v_tenant_id
     )
  ) then
    raise exception 'REGISTRANT_NOT_FOUND';
  end if;

  -- Rows already in the state asked for are left alone, so marking a
  -- selection that includes somebody added last week keeps last week's date
  -- and name.
  update public.event_registrations r
     set group_chat_added_at = case when p_added then now() end,
         group_chat_added_by = case when p_added then auth.uid() end
   where r.id = any(p_registration_ids)
     and r.event_id = p_event_id
     and r.tenant_id = v_tenant_id
     and (r.group_chat_added_at is null) = p_added;

  get diagnostics v_changed = row_count;
  return v_changed;
end;
$function$;

CREATE OR REPLACE FUNCTION public.stamp_event_reminder(p_registration_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_found boolean;
begin
  if not public.has_event_access((select r.event_id from public.event_registrations r where r.id = p_registration_id), 'event_registrations', 'manage') then
    raise exception 'FORBIDDEN';
  end if;

  update public.event_registrations r
     set reminder_sent_at = now()
   where r.id = p_registration_id
     and r.tenant_id = (select public.current_tenant_id())
     and r.cancelled_at is null
     and nullif(btrim(coalesce(r.email, '')), '') is not null
  returning true into v_found;

  return coalesce(v_found, false);
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_event_sponsor(p_id uuid, p_support_type text, p_contribution_value numeric, p_is_public boolean, p_notes text, p_follow_up_status text, p_follow_up_notes text, p_items jsonb DEFAULT '[]'::jsonb, p_follow_up_owner_person_id uuid DEFAULT NULL::uuid, p_follow_up_due_date date DEFAULT NULL::date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.has_event_access((select s.event_id from public.event_sponsors s where s.id = p_id), 'event_sponsors', 'manage') then
    raise exception 'Not authorized to manage sponsors';
  end if;

  update public.event_sponsors
  set support_type = p_support_type,
      contribution_value = p_contribution_value,
      is_public = p_is_public,
      notes = p_notes,
      follow_up_status = p_follow_up_status,
      follow_up_notes = p_follow_up_notes,
      follow_up_owner_person_id = p_follow_up_owner_person_id,
      follow_up_due_date = p_follow_up_due_date
  where id = p_id
    and tenant_id = (select public.current_tenant_id());

  if not found then
    raise exception 'Sponsor not found';
  end if;

  perform public.sync_event_sponsor_donations(p_id, p_items);
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_giveaway_prize(p_prize_id uuid, p_prize_name text, p_donor_person_id uuid DEFAULT NULL::uuid, p_estimated_value numeric DEFAULT NULL::numeric, p_notes text DEFAULT NULL::text, p_source_inventory_item_id uuid DEFAULT NULL::uuid, p_source_monetary_donation_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_event_id uuid;
  v_old_item_id uuid;
begin
  if not public.has_event_access((select g.event_id from public.giveaway_prizes p join public.giveaways g on g.id = p.giveaway_id where p.id = p_prize_id), 'giveaway_prizes', 'manage') then
    raise exception 'Not authorized to manage this giveaway';
  end if;

  select g.event_id, gp.source_inventory_item_id
  into v_event_id, v_old_item_id
  from public.giveaway_prizes gp
  join public.giveaways g on g.id = gp.giveaway_id
  where gp.id = p_prize_id
    and gp.tenant_id = (select public.current_tenant_id());

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
$function$;

CREATE OR REPLACE FUNCTION public.upsert_giveaway_winner(p_prize_id uuid, p_winner_name text, p_winner_contact text DEFAULT NULL::text, p_distribution_status text DEFAULT 'pending'::text, p_distributed_at date DEFAULT NULL::date, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tenant_id uuid := (select public.current_tenant_id());
  v_event_id uuid;
  v_item_id uuid;
  v_item_status text;
  v_winner_id uuid;
  v_winner_person_id uuid;
begin
  if not public.has_event_access((select g.event_id from public.giveaway_prizes p join public.giveaways g on g.id = p.giveaway_id where p.id = p_prize_id), 'giveaway_winners', 'manage') then
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
       coalesce((p_distributed_at + time '12:00') at time zone 'UTC', now()),
       'Giveaway prize awarded',
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
$function$;


create or replace function public.set_event_media_public(p_ids uuid[], p_public boolean)
returns integer
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_count integer;
begin
  -- A grant holder only for media of events their grant reaches: one id
  -- outside them refuses the whole call.
  if v_tenant_id is null or not (
    public.has_permission('events', 'manage')
    or (
      public.has_any_event_access('event_media', 'manage')
      and not exists (
        select 1 from public.event_media m
         where m.tenant_id = v_tenant_id
           and m.id = any (coalesce(p_ids, '{}'))
           and not public.has_event_access(m.event_id, 'event_media', 'manage')
      )
    )
  ) then
    raise exception 'PERMISSION_DENIED';
  end if;

  if p_public is null then
    raise exception 'INVALID_SETTING';
  end if;

  update public.event_media
     set is_public = p_public
   where tenant_id = v_tenant_id
     and id = any (coalesce(p_ids, '{}'))
     and is_public is distinct from p_public;
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 4. Storage
-- ---------------------------------------------------------------------------

-- Event media objects are `{tenant}/{event}/{media}.ext`; the event comes
-- off the path. Insert already goes through can_upload_event_media(),
-- redefined above.
alter policy "event-media select" on storage.objects
  using (
    bucket_id = 'event-media'
    and (storage.foldername(name))[1] = (select public.current_tenant_id())::text
    and (
      public.has_permission('events', 'view')
      or public.event_media_path_event_id(name)
        = any ((select public.event_access_ids('event_media', 'view'))::uuid[])
    )
  );

alter policy "event-media delete" on storage.objects
  using (
    bucket_id = 'event-media'
    and (storage.foldername(name))[1] = (select public.current_tenant_id())::text
    and (
      public.has_permission('events', 'manage')
      or public.event_media_path_event_id(name)
        = any ((select public.event_access_ids('event_media', 'manage'))::uuid[])
    )
  );

-- A flier is a site photo, `{tenant}/{uuid}.jpg`, with no event in its path,
-- so anyone who may edit some event's details may upload one, as an
-- events: manage holder may today.
alter policy "site-photos tenant insert" on storage.objects
  with check (
    bucket_id = 'site-photos'
    and (storage.foldername(name))[1] = (select public.current_tenant_id())::text
    and array_length(storage.foldername(name), 1) = 1
    and not public.current_tenant_is_demo()
    and (
      public.has_permission('site_content', 'manage')
      or public.has_permission('people', 'manage')
      or public.has_permission('events', 'manage')
      or public.has_permission('system_settings', 'manage')
      or cardinality((select public.event_access_ids('events', 'manage'))) > 0
    )
  );

-- Receipts likewise carry no event (`{tenant}/receipts/{uuid}`); reading one
-- back already goes through event_expenses' own RLS.
alter policy "documents receipts insert" on storage.objects
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = (select public.current_tenant_id())::text
    and (storage.foldername(name))[2] = 'receipts'
    and array_length(storage.foldername(name), 1) = 3
    and not public.current_tenant_is_demo()
    and (
      public.has_permission('event_expenses', 'manage')
      or public.has_permission('reimbursements', 'manage')
      or cardinality((select public.event_access_ids('event_expenses', 'manage'))) > 0
    )
  );
