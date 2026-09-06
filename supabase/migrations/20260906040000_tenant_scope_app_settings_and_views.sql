-- Multi-tenancy Phase 2 (#707): app_settings, the fiscal year, the audit log
-- and the anon-facing views know which tenant they are answering for.
--
-- app_settings was a flat global key/value store; 20260906020000 made its
-- key unique per tenant. Everything that read it by key alone -- the three
-- policies, the org_fiscal_year view, the two anon views that slice it by
-- prefix, and the four approval functions that embed a threshold lookup --
-- would now find one row per tenant. Each gets a tenant predicate:
--
-- - Signed-in reads use current_tenant_id(). The approval functions use the
--   tenant of the expense or reimbursement being approved, which is stricter
--   still and correct even if a support engineer is looking at it.
-- - The eight views granted to anon use default_tenant_id(). Anon has no
--   session, so on today's single-tenant database this resolves to the sole
--   tenant and nothing changes; on a multi-tenant database it resolves to
--   null and the public site shows nothing rather than everything. Phase 3
--   replaces that with resolution from the request host, in the function,
--   with no change to the views.
--
-- `create or replace view` keeps each view's column list, so the existing
-- anon/authenticated grants carry over.
--
-- audit_log's select policy was "any administration:manage user sees every
-- row"; it now sees the current tenant's rows plus the rows that have no
-- tenant (the global tables listed in 20260906010000).

-- app_settings ---------------------------------------------------------------

drop policy "app_settings select" on public.app_settings;
create policy "app_settings select" on public.app_settings for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and (
      public.has_permission('system_settings', 'manage')
      or public.has_permission('event_expenses', 'manage')
      or public.has_permission('finance_approvals', 'manage')
      or public.has_permission('content_calendar', 'manage')
      or public.has_permission('reimbursements', 'manage')
      or public.has_permission('reimbursement_approvals', 'manage')
    )
  );

drop policy "app_settings insert" on public.app_settings;
create policy "app_settings insert" on public.app_settings for insert to authenticated
  with check (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('system_settings', 'manage')
  );

drop policy "app_settings update" on public.app_settings;
create policy "app_settings update" on public.app_settings for update to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('system_settings', 'manage')
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('system_settings', 'manage')
  );

-- audit_log ------------------------------------------------------------------

drop policy "audit_log select" on public.audit_log;
create policy "audit_log select" on public.audit_log for select to authenticated
  using (
    public.has_permission('administration', 'manage')
    and (tenant_id is null or tenant_id = (select public.current_tenant_id()))
  );

-- Views ----------------------------------------------------------------------

create or replace view public.org_fiscal_year as
select (value #>> '{}')::int as start_month
from public.app_settings
where key = 'org.fiscal_year_start_month'
  and tenant_id = public.current_tenant_id();

create or replace view public.public_page_visibility as
select substring(key from length('page_visibility.') + 1) as slot, value
from public.app_settings
where key like 'page_visibility.%'
  and tenant_id = public.default_tenant_id();

create or replace view public.public_site_images as
select substring(key from length('site_images.') + 1) as slot, value
from public.app_settings
where key like 'site_images.%'
  and tenant_id = public.default_tenant_id();

create or replace view public.public_events as
select
  id, name, location, starts_at, ends_at, timezone, description, capacity,
  registration_enabled, registration_deadline, flier_url
from public.events
where visibility = 'public'
  and status = 'published'
  and tenant_id = public.default_tenant_id();

create or replace view public.public_calendar_items as
select
  ci.id,
  ci.title,
  ci.item_type,
  ci.starts_at,
  ci.ends_at,
  ci.time_zone,
  ci.summary,
  (select array_agg(c.category) from public.calendar_item_categories c where c.item_id = ci.id) as categories,
  ci.public_url
from public.calendar_items ci
where ci.visibility = 'public'
  and ci.calendar_status in ('active', 'complete')
  and ci.tenant_id = public.default_tenant_id()
union all
select
  e.id,
  e.name as title,
  'chatter_event' as item_type,
  e.starts_at,
  e.ends_at,
  e.timezone as time_zone,
  e.description as summary,
  array['chatter_events'] as categories,
  '/events/' || e.id::text as public_url
from public.events e
where e.visibility = 'public'
  and e.status = 'published'
  and e.tenant_id = public.default_tenant_id();

create or replace view public.public_event_programs as
select ep.event_id, p.id as program_id, p.name
from public.event_programs ep
join public.programs p on p.id = ep.program_id
join public.events e on e.id = ep.event_id
where e.visibility = 'public'
  and e.status = 'published'
  and e.tenant_id = public.default_tenant_id();

create or replace view public.public_event_sponsors as
select es.id as sponsor_id, es.event_id, p.name, p.logo_url, p.website
from public.event_sponsors es
join public.people p on p.id = es.person_id
join public.events e on e.id = es.event_id
where es.is_public = true
  and e.visibility = 'public'
  and e.status = 'published'
  and e.tenant_id = public.default_tenant_id();

create or replace view public.public_gear_catalog as
select
  ii.id, ii.description, ii.size, ii.type, ii.gender, ii.condition, ii.photo_url, ii.created_at,
  c.key as category_key,
  c.label as category_label,
  g.key as category_group_key,
  g.label as category_group_label,
  c.sort_order as category_sort_order,
  g.sort_order as category_group_sort_order
from public.inventory_items ii
left join public.inventory_categories c on c.id = ii.category_id
left join public.inventory_category_groups g on g.id = c.group_id
where ii.status = 'available'
  and ii.intended_use = 'gear_library'
  and ii.tenant_id = public.default_tenant_id();

create or replace view public.public_volunteer_role_types as
select id, name, description
from public.volunteer_role_types
where is_public = true
  and tenant_id = public.default_tenant_id();

-- Approval functions that embed a threshold lookup -----------------------------
-- Bodies from 20260823050000, 20260826000000 and 20260828110000 with the
-- app_settings read scoped to the row's own tenant.

create or replace function public.approve_event_expense(p_id uuid)
returns public.event_expenses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expense public.event_expenses;
  v_threshold numeric;
begin
  select * into v_expense from public.event_expenses where id = p_id for update;
  if v_expense.id is null then
    raise exception 'Expense not found';
  end if;
  if v_expense.status <> 'submitted' then
    raise exception 'Only submitted expenses can be approved';
  end if;

  if public.has_permission('finance_approvals', 'manage') and v_expense.submitted_by <> auth.uid() then
    update public.event_expenses
      set status = 'approved', approved_by = auth.uid(), approved_at = now()
      where id = p_id
      returning * into v_expense;
    return v_expense;
  end if;

  if public.has_permission('finance_self_approval', 'manage') and v_expense.submitted_by = auth.uid() then
    select (value #>> '{}')::numeric into v_threshold
      from public.app_settings
      where key = 'finance.expense_approval_threshold'
        and tenant_id = v_expense.tenant_id;
    if v_threshold is null then
      raise exception 'Approval threshold is not configured';
    end if;
    if v_expense.amount >= v_threshold then
      raise exception 'This expense is at or above the approval threshold and requires a second approver';
    end if;
    update public.event_expenses
      set status = 'approved', approved_by = auth.uid(), approved_at = now()
      where id = p_id
      returning * into v_expense;
    return v_expense;
  end if;

  raise exception 'Not authorized to approve this expense';
end;
$$;

create or replace function public.approve_reimbursement(p_id uuid)
returns public.reimbursements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reimbursement public.reimbursements;
  v_threshold numeric;
begin
  select * into v_reimbursement from public.reimbursements where id = p_id for update;
  if v_reimbursement.id is null then
    raise exception 'Reimbursement not found';
  end if;
  if v_reimbursement.status <> 'submitted' then
    raise exception 'Only submitted reimbursements can be approved';
  end if;

  if public.has_permission('reimbursement_approvals', 'manage') and v_reimbursement.submitted_by <> auth.uid() then
    update public.reimbursements
      set status = 'approved', approved_by = auth.uid(), approved_at = now()
      where id = p_id
      returning * into v_reimbursement;
    return v_reimbursement;
  end if;

  if public.has_permission('reimbursement_self_approval', 'manage') and v_reimbursement.submitted_by = auth.uid() then
    select (value #>> '{}')::numeric into v_threshold
      from public.app_settings
      where key = 'finance.reimbursement_approval_threshold'
        and tenant_id = v_reimbursement.tenant_id;
    if v_threshold is null then
      raise exception 'Approval threshold is not configured';
    end if;
    if v_reimbursement.amount >= v_threshold then
      raise exception 'This reimbursement is at or above the approval threshold and requires a second approver';
    end if;
    update public.reimbursements
      set status = 'approved', approved_by = auth.uid(), approved_at = now()
      where id = p_id
      returning * into v_reimbursement;
    return v_reimbursement;
  end if;

  raise exception 'Not authorized to approve this reimbursement';
end;
$$;

-- The pending-approval counts are shown in the current tenant's shell, so
-- they count the current tenant's rows. The cross-tenant rows they would
-- otherwise see are Phase 3's policy rewrite; the predicate here is what
-- keeps the badge honest in the meantime.
create or replace function public.count_pending_event_expense_approvals()
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::integer
  from public.event_expenses e
  where e.status = 'submitted'
    and e.tenant_id = (select public.current_tenant_id())
    and (
      (public.has_permission('finance_approvals', 'manage') and e.submitted_by <> auth.uid())
      or (
        public.has_permission('finance_self_approval', 'manage')
        and e.submitted_by = auth.uid()
        and e.amount < coalesce(
          (select (value #>> '{}')::numeric from public.app_settings
            where key = 'finance.expense_approval_threshold'
              and tenant_id = e.tenant_id),
          0
        )
      )
    );
$$;

create or replace function public.count_pending_reimbursement_approvals()
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::integer
  from public.reimbursements r
  where r.status = 'submitted'
    and r.tenant_id = (select public.current_tenant_id())
    and (
      (public.has_permission('reimbursement_approvals', 'manage') and r.submitted_by <> auth.uid())
      or (
        public.has_permission('reimbursement_self_approval', 'manage')
        and r.submitted_by = auth.uid()
        and r.amount < coalesce(
          (select (value #>> '{}')::numeric from public.app_settings
            where key = 'finance.reimbursement_approval_threshold'
              and tenant_id = r.tenant_id),
          0
        )
      )
    );
$$;
