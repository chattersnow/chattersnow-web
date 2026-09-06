-- Multi-tenancy Phase 3 (#707): the security definer audit.
--
-- `security definer` bypasses row-level security by design, so the policy
-- rewrite in 20260906070000 does nothing for a function that reads a table
-- by a caller-supplied id. Every one of the 84 security definer functions in
-- the schema was read for this migration; the ones below are those that
-- looked a row up, aggregated a table, or updated by id without asking which
-- tenant the row belongs to. Each now filters on the caller's current tenant,
-- so an id from another tenant reads as "not found" -- the same answer a
-- made-up id gets, so nothing leaks by existence either.
--
-- Not changed, and why:
--
-- - Already tenant-scoped in Phase 2: the permission core, the people
--   directory and merge RPCs, the approval counters, list_portal_users,
--   list_calendar_owners, claim_pending_role_grants.
-- - Anon intake: rewritten in 20260906060000 against the host-resolved
--   tenant.
-- - Platform-global by design: check_rate_limit (per-IP velocity), the
--   user_onboarding RPCs (one row per account), the retention purge and its
--   helpers (one nightly sweep; per-tenant policies are a Phase 4 item),
--   set_current_tenant, ensure_tenant_membership.
-- - Triggers (audit_log_row, snapshot_rider_profile_on_checkin,
--   prevent_event_delete_with_records, ensure_membership_for_role): they
--   act on the row that fired them.
-- - Internal helpers with no execute grant to anon or authenticated
--   (event_linked_record_labels, grant_giveaway_tickets,
--   sync_event_sponsor_donations, resolve_or_create_person_by_email,
--   generate_volunteer_reference_code): reachable only through the RPCs
--   above, which now check the tenant before calling them.
-- - trigger_retention_run and set_retention_policy_mode: any tenant's admin
--   can run or reconfigure the platform-wide purge. Correct while retention
--   is global; revisit when Phase 4 makes policies per tenant.
--
-- Inserts through these RPCs keep relying on the tenant_id column default
-- (the caller's current tenant); the composite foreign keys from
-- 20260906080000 are what reject a reference into another tenant if a check
-- here were ever missed.
--
-- Bodies are those of the migrations that last defined each function, with
-- the tenant predicate added; nothing else changes.

-- Finance: approvals and payment ---------------------------------------------

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
  select * into v_expense from public.event_expenses
   where id = p_id and tenant_id = (select public.current_tenant_id()) for update;
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

create or replace function public.reject_event_expense(p_id uuid, p_reason text)
returns public.event_expenses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expense public.event_expenses;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A rejection reason is required';
  end if;

  select * into v_expense from public.event_expenses
   where id = p_id and tenant_id = (select public.current_tenant_id()) for update;
  if v_expense.id is null then
    raise exception 'Expense not found';
  end if;
  if v_expense.status <> 'submitted' then
    raise exception 'Only submitted expenses can be rejected';
  end if;
  if not (public.has_permission('finance_approvals', 'manage') and v_expense.submitted_by <> auth.uid()) then
    raise exception 'Not authorized to reject this expense';
  end if;

  update public.event_expenses
    set status = 'rejected', rejected_at = now(), rejected_by = auth.uid(), rejection_reason = btrim(p_reason)
    where id = p_id
    returning * into v_expense;
  return v_expense;
end;
$$;

create or replace function public.mark_event_expense_paid(p_id uuid)
returns public.event_expenses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expense public.event_expenses;
begin
  if not public.has_permission('finance', 'manage') then
    raise exception 'Not authorized to mark this expense paid';
  end if;

  select * into v_expense from public.event_expenses
   where id = p_id and tenant_id = (select public.current_tenant_id()) for update;
  if v_expense.id is null then
    raise exception 'Expense not found';
  end if;
  if v_expense.status <> 'approved' then
    raise exception 'Only approved expenses can be marked paid';
  end if;

  update public.event_expenses
    set status = 'paid', paid_by = auth.uid(), paid_at = now()
    where id = p_id
    returning * into v_expense;
  return v_expense;
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
  select * into v_reimbursement from public.reimbursements
   where id = p_id and tenant_id = (select public.current_tenant_id()) for update;
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

create or replace function public.reject_reimbursement(p_id uuid, p_reason text)
returns public.reimbursements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reimbursement public.reimbursements;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A rejection reason is required';
  end if;

  select * into v_reimbursement from public.reimbursements
   where id = p_id and tenant_id = (select public.current_tenant_id()) for update;
  if v_reimbursement.id is null then
    raise exception 'Reimbursement not found';
  end if;
  if v_reimbursement.status <> 'submitted' then
    raise exception 'Only submitted reimbursements can be rejected';
  end if;
  if not (public.has_permission('reimbursement_approvals', 'manage') and v_reimbursement.submitted_by <> auth.uid()) then
    raise exception 'Not authorized to reject this reimbursement';
  end if;

  update public.reimbursements
    set status = 'rejected', rejected_at = now(), rejection_reason = btrim(p_reason)
    where id = p_id
    returning * into v_reimbursement;
  return v_reimbursement;
end;
$$;

create or replace function public.mark_reimbursement_paid(p_id uuid)
returns public.reimbursements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reimbursement public.reimbursements;
begin
  if not public.has_permission('reimbursements', 'manage') then
    raise exception 'Not authorized to mark this reimbursement paid';
  end if;

  select * into v_reimbursement from public.reimbursements
   where id = p_id and tenant_id = (select public.current_tenant_id()) for update;
  if v_reimbursement.id is null then
    raise exception 'Reimbursement not found';
  end if;
  if v_reimbursement.status <> 'approved' then
    raise exception 'Only approved reimbursements can be marked paid';
  end if;

  update public.reimbursements
    set status = 'paid', paid_by = auth.uid(), paid_at = now()
    where id = p_id
    returning * into v_reimbursement;
  return v_reimbursement;
end;
$$;

-- The actors an expense list shows are looked up in auth.users by id. Only
-- accounts that have acted on one of the current tenant's expenses or
-- reimbursements are answered for; any other id -- another tenant's staff --
-- is simply absent from the result.
create or replace function public.list_expense_actors(p_user_ids uuid[])
returns table (user_id uuid, email text, full_name text)
language sql
security definer
set search_path = public
stable
as $$
  select u.id, u.email,
    coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name')
  from auth.users u
  where public.has_permission('event_expenses', 'view')
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
$$;

create or replace function public.get_finance_report_data(p_from date, p_to date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_tenant_id uuid := public.current_tenant_id();
begin
  if not public.has_permission('finance_reports', 'view') then
    raise exception 'Not authorized to view financial reports';
  end if;

  if p_from is null or p_to is null then
    raise exception 'Both a from date and a to date are required';
  end if;

  if p_from > p_to then
    raise exception 'The from date must not be after the to date';
  end if;

  select jsonb_build_object(
    'revenue', coalesce((
      select jsonb_agg(jsonb_build_object(
        'source', revs.source,
        'amount', revs.amount,
        'event_id', revs.event_id,
        'event_name', evt.name
      ))
      from public.event_revenue revs
      left join public.events evt on evt.id = revs.event_id
      where revs.tenant_id = v_tenant_id
        and revs.received_date between p_from and p_to
    ), '[]'::jsonb),
    'expenses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'status', exps.status,
        'amount', exps.amount,
        'event_id', exps.event_id,
        'event_name', evt.name
      ))
      from public.event_expenses exps
      left join public.events evt on evt.id = exps.event_id
      where exps.tenant_id = v_tenant_id
        and exps.expense_date between p_from and p_to
    ), '[]'::jsonb),
    'reimbursements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'status', reims.status,
        'amount', reims.amount,
        'event_id', reims.event_id,
        'event_name', evt.name
      ))
      from public.reimbursements reims
      left join public.events evt on evt.id = reims.event_id
      where reims.tenant_id = v_tenant_id
        and reims.created_at::date between p_from and p_to
    ), '[]'::jsonb),
    'in_kind_items', coalesce((
      select jsonb_agg(jsonb_build_object('face_value', items.face_value))
      from public.inventory_items items
      join public.donations dons on dons.id = items.donation_id
      where items.tenant_id = v_tenant_id
        and dons.donated_at::date between p_from and p_to
    ), '[]'::jsonb),
    'monetary_donations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'amount', mds.amount,
        'event_id', mds.event_id,
        'event_name', evt.name,
        'donor_name', ppl.name
      ))
      from public.monetary_donations mds
      left join public.events evt on evt.id = mds.event_id
      left join public.people ppl on ppl.id = mds.donor_id
      where mds.tenant_id = v_tenant_id
        and mds.received_date between p_from and p_to
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

-- Events -----------------------------------------------------------------------

create or replace function public.reopen_event_report(p_id uuid, p_reason text)
returns public.events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required to reopen this report';
  end if;

  if not public.is_admin() then
    raise exception 'Not authorized to reopen this report';
  end if;

  select * into v_event from public.events
   where id = p_id and tenant_id = (select public.current_tenant_id()) for update;
  if v_event.id is null then
    raise exception 'Event not found';
  end if;
  if v_event.report_status <> 'submitted' then
    raise exception 'Only a submitted report can be reopened';
  end if;

  update public.events
    set report_status = 'in_progress',
        report_reopened_at = now(),
        report_reopened_by = auth.uid(),
        report_reopen_reason = btrim(p_reason)
    where id = p_id
    returning * into v_event;
  return v_event;
end;
$$;

create or replace function public.event_delete_blockers(p_id uuid)
returns text[]
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.has_permission('events', 'manage') then
    raise exception 'You do not have permission to manage events.'
      using errcode = 'insufficient_privilege';
  end if;

  if not exists (
    select 1 from public.events
     where id = p_id and tenant_id = (select public.current_tenant_id())
  ) then
    raise exception 'Event not found';
  end if;

  return public.event_linked_record_labels(p_id);
end;
$$;

create or replace function public.set_registrant_rider_profile(
  p_registration_id uuid,
  p_riding_discipline text,
  p_ski_experience_level text default null,
  p_snowboard_experience_level text default null,
  p_preferred_mountain text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person_id uuid;
  v_checked_in timestamptz;
  v_ski text;
  v_snowboard text;
begin
  if not public.has_permission('events', 'manage') then
    raise exception 'Not authorized to edit registrant rider profiles';
  end if;

  if p_riding_discipline not in ('ski', 'snowboard', 'both') then
    raise exception 'INVALID_RIDER_PROFILE';
  end if;

  v_ski := case when p_riding_discipline in ('ski', 'both') then p_ski_experience_level end;
  v_snowboard := case when p_riding_discipline in ('snowboard', 'both') then p_snowboard_experience_level end;

  if p_riding_discipline in ('ski', 'both')
     and (v_ski is null or v_ski not in ('beginner', 'intermediate', 'advanced')) then
    raise exception 'INVALID_RIDER_PROFILE';
  end if;
  if p_riding_discipline in ('snowboard', 'both')
     and (v_snowboard is null or v_snowboard not in ('beginner', 'intermediate', 'advanced')) then
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
$$;

-- An event from another tenant is treated as no event: the id is cleared so
-- every subquery below finds nothing, and the caller gets the same empty
-- shape it gets for an id that does not exist.
create or replace function public.get_event_impact_derived_data(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_can_view_impact boolean;
  v_result jsonb;
  v_event_id uuid;
begin
  v_can_view_impact := public.has_permission('event_impact', 'view');

  if not (v_can_view_impact or public.has_permission('events', 'view')) then
    raise exception 'Not authorized to view event impact figures';
  end if;

  select id into v_event_id
    from public.events
   where id = p_event_id
     and tenant_id = (select public.current_tenant_id());

  select jsonb_build_object(
    'event_id', p_event_id,
    'auto_assign_discount_codes', coalesce((
      select auto_assign_discount_codes from public.events where id = v_event_id
    ), false),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'event_id', id,
        'attendance_count', attendance_count
      ))
      from public.events
      where id = v_event_id
    ), '[]'::jsonb),
    'registrations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'person_id', person_id,
        'event_id', event_id,
        'checked_in_at', checked_in_at
      ))
      from public.event_registrations
      where event_id = v_event_id
    ), '[]'::jsonb),
    'checkin_counts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'person_id', person_id,
        'checked_in_event_count', checked_in_event_count
      ))
      from (
        select person_id, count(*) as checked_in_event_count
        from public.event_registrations
        where checked_in_at is not null
          and person_id = any(
            select distinct person_id
            from public.event_registrations
            where event_id = v_event_id
              and checked_in_at is not null
              and person_id is not null
          )
        group by person_id
      ) per_person
    ), '[]'::jsonb),
    'event_volunteers', coalesce((
      select jsonb_agg(jsonb_build_object('event_id', event_id, 'person_id', person_id))
      from public.event_volunteers
      where event_id = v_event_id and person_id is not null
    ), '[]'::jsonb),
    'volunteer_hour_people', coalesce((
      select jsonb_agg(jsonb_build_object('event_id', event_id, 'person_id', person_id))
      from (
        select distinct event_id, person_id
        from public.volunteer_hours
        where event_id = v_event_id
      ) vh
    ), '[]'::jsonb),
    'discount_codes', case when v_can_view_impact then coalesce((
      select jsonb_agg(jsonb_build_object(
        'event_id', event_id,
        'registration_id', registration_id
      ))
      from public.discount_codes
      where event_id = v_event_id and registration_id is not null
    ), '[]'::jsonb) else null::jsonb end,
    'beginner_attendees', case when v_can_view_impact then coalesce((
      select jsonb_agg(jsonb_build_object('event_id', event_id, 'person_id', person_id))
      from (
        select distinct r.event_id, r.person_id
        from public.event_registrations r
        join public.people p on p.id = r.person_id
        cross join lateral (
          select case when r.riding_discipline_at_event is not null
                      then r.ski_experience_level_at_event
                      else p.ski_experience_level end as ski_level,
                 case when r.riding_discipline_at_event is not null
                      then r.snowboard_experience_level_at_event
                      else p.snowboard_experience_level end as snowboard_level
        ) lvl
        where r.event_id = v_event_id
          and r.checked_in_at is not null
          and (lvl.ski_level = 'beginner' or lvl.snowboard_level = 'beginner')
      ) beginners
    ), '[]'::jsonb) else null::jsonb end,
    'profiled_attendees', case when v_can_view_impact then coalesce((
      select jsonb_agg(jsonb_build_object('event_id', event_id, 'person_id', person_id))
      from (
        select distinct r.event_id, r.person_id
        from public.event_registrations r
        join public.people p on p.id = r.person_id
        cross join lateral (
          select case when r.riding_discipline_at_event is not null
                      then r.ski_experience_level_at_event
                      else p.ski_experience_level end as ski_level,
                 case when r.riding_discipline_at_event is not null
                      then r.snowboard_experience_level_at_event
                      else p.snowboard_experience_level end as snowboard_level
        ) lvl
        where r.event_id = v_event_id
          and r.checked_in_at is not null
          and (lvl.ski_level is not null or lvl.snowboard_level is not null)
      ) profiled
    ), '[]'::jsonb) else null::jsonb end
  ) into v_result;

  return v_result;
end;
$$;

-- Same shape for programs: the event list is the current tenant's events on
-- the program, so a foreign program id yields an empty rollup.
create or replace function public.get_program_impact_rollup_data(p_program_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_ids uuid[];
  v_result jsonb;
begin
  if not public.has_permission('programs_reports', 'view') then
    raise exception 'Not authorized to view program impact reports';
  end if;

  select coalesce(array_agg(event_id), '{}') into v_event_ids
  from public.event_programs
  where program_id = p_program_id
    and tenant_id = (select public.current_tenant_id());

  select jsonb_build_object(
    'event_ids', to_jsonb(v_event_ids),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'event_id', id,
        'attendance_count', attendance_count
      ))
      from public.events
      where id = any(v_event_ids)
    ), '[]'::jsonb),
    'impact_notes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'event_id', event_id,
        'rental_subsidies_count', rental_subsidies_count,
        'assistance_total', assistance_total
      ))
      from public.event_impact_notes
      where event_id = any(v_event_ids)
    ), '[]'::jsonb),
    'distributed_movements', coalesce((
      select jsonb_agg(jsonb_build_object('quantity', quantity, 'event_id', event_id))
      from public.inventory_movements
      where event_id = any(v_event_ids) and movement_type = 'distributed'
    ), '[]'::jsonb),
    'volunteer_hours', coalesce((
      select jsonb_agg(jsonb_build_object('event_id', event_id, 'hours', hours))
      from public.volunteer_hours
      where event_id = any(v_event_ids)
    ), '[]'::jsonb),
    'event_volunteers', coalesce((
      select jsonb_agg(jsonb_build_object('event_id', event_id, 'person_id', person_id))
      from public.event_volunteers
      where event_id = any(v_event_ids) and person_id is not null
    ), '[]'::jsonb),
    'volunteer_hour_people', coalesce((
      select jsonb_agg(jsonb_build_object('event_id', event_id, 'person_id', person_id))
      from (
        select distinct event_id, person_id
        from public.volunteer_hours
        where event_id = any(v_event_ids)
      ) vh
    ), '[]'::jsonb),
    'beginner_attendees', coalesce((
      select jsonb_agg(jsonb_build_object('event_id', event_id, 'person_id', person_id))
      from (
        select distinct r.event_id, r.person_id
        from public.event_registrations r
        join public.people p on p.id = r.person_id
        cross join lateral (
          select case when r.riding_discipline_at_event is not null
                      then r.ski_experience_level_at_event
                      else p.ski_experience_level end as ski_level,
                 case when r.riding_discipline_at_event is not null
                      then r.snowboard_experience_level_at_event
                      else p.snowboard_experience_level end as snowboard_level
        ) lvl
        where r.event_id = any(v_event_ids)
          and r.checked_in_at is not null
          and (lvl.ski_level = 'beginner' or lvl.snowboard_level = 'beginner')
      ) beginners
    ), '[]'::jsonb),
    'profiled_attendees', coalesce((
      select jsonb_agg(jsonb_build_object('event_id', event_id, 'person_id', person_id))
      from (
        select distinct r.event_id, r.person_id
        from public.event_registrations r
        join public.people p on p.id = r.person_id
        cross join lateral (
          select case when r.riding_discipline_at_event is not null
                      then r.ski_experience_level_at_event
                      else p.ski_experience_level end as ski_level,
                 case when r.riding_discipline_at_event is not null
                      then r.snowboard_experience_level_at_event
                      else p.snowboard_experience_level end as snowboard_level
        ) lvl
        where r.event_id = any(v_event_ids)
          and r.checked_in_at is not null
          and (lvl.ski_level is not null or lvl.snowboard_level is not null)
      ) profiled
    ), '[]'::jsonb),
    'registrations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'person_id', person_id,
        'event_id', event_id,
        'checked_in_at', checked_in_at
      ))
      from public.event_registrations
      where event_id = any(v_event_ids)
    ), '[]'::jsonb),
    'checkin_counts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'person_id', person_id,
        'checked_in_event_count', checked_in_event_count
      ))
      from (
        select person_id, count(*) as checked_in_event_count
        from public.event_registrations
        where checked_in_at is not null
          and person_id = any(
            select distinct person_id
            from public.event_registrations
            where event_id = any(v_event_ids)
              and checked_in_at is not null
              and person_id is not null
          )
        group by person_id
      ) per_person
    ), '[]'::jsonb),
    'discount_codes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'event_id', event_id,
        'registration_id', registration_id
      ))
      from public.discount_codes
      where event_id = any(v_event_ids) and registration_id is not null
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

-- Sponsors -----------------------------------------------------------------------

create or replace function public.create_event_sponsor(
  p_event_id uuid,
  p_person_id uuid,
  p_support_type text,
  p_in_kind_description text,
  p_contribution_value numeric,
  p_is_public boolean,
  p_notes text,
  p_follow_up_status text,
  p_follow_up_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sponsor_id uuid;
  v_tenant_id uuid := public.current_tenant_id();
begin
  if not public.has_permission('events', 'manage') then
    raise exception 'Not authorized to manage sponsors';
  end if;

  if not exists (select 1 from public.events where id = p_event_id and tenant_id = v_tenant_id) then
    raise exception 'Event not found';
  end if;
  if not exists (select 1 from public.people where id = p_person_id and tenant_id = v_tenant_id) then
    raise exception 'No such person';
  end if;

  insert into public.event_sponsors (
    event_id, person_id, support_type, in_kind_description, contribution_value,
    is_public, notes, follow_up_status, follow_up_notes
  )
  values (
    p_event_id, p_person_id, p_support_type, p_in_kind_description, p_contribution_value,
    p_is_public, p_notes, p_follow_up_status, p_follow_up_notes
  )
  returning id into v_sponsor_id;

  perform public.sync_event_sponsor_donations(v_sponsor_id);

  return v_sponsor_id;
end;
$$;

create or replace function public.update_event_sponsor(
  p_id uuid,
  p_support_type text,
  p_in_kind_description text,
  p_contribution_value numeric,
  p_is_public boolean,
  p_notes text,
  p_follow_up_status text,
  p_follow_up_notes text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission('events', 'manage') then
    raise exception 'Not authorized to manage sponsors';
  end if;

  update public.event_sponsors
  set support_type = p_support_type,
      in_kind_description = p_in_kind_description,
      contribution_value = p_contribution_value,
      is_public = p_is_public,
      notes = p_notes,
      follow_up_status = p_follow_up_status,
      follow_up_notes = p_follow_up_notes
  where id = p_id
    and tenant_id = (select public.current_tenant_id());

  if not found then
    raise exception 'Sponsor not found';
  end if;

  perform public.sync_event_sponsor_donations(p_id);
end;
$$;

create or replace function public.delete_event_sponsor(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_donation_id uuid;
  v_inventory_item_id uuid;
  v_monetary_donation_id uuid;
begin
  if not public.has_permission('events', 'manage') then
    raise exception 'Not authorized to manage sponsors';
  end if;

  select donation_id, inventory_item_id, monetary_donation_id
  into v_donation_id, v_inventory_item_id, v_monetary_donation_id
  from public.event_sponsors
  where id = p_id
    and tenant_id = (select public.current_tenant_id());

  if not found then
    return;
  end if;

  if v_inventory_item_id is not null then
    delete from public.inventory_movements where inventory_item_id = v_inventory_item_id;
    delete from public.inventory_items where id = v_inventory_item_id;
  end if;

  if v_donation_id is not null then
    delete from public.donations where id = v_donation_id;
  end if;

  if v_monetary_donation_id is not null then
    delete from public.monetary_donations where id = v_monetary_donation_id;
  end if;

  delete from public.event_sponsors where id = p_id;
end;
$$;

-- Giveaways ------------------------------------------------------------------------

create or replace function public.seed_giveaway_tiers(p_giveaway_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gold uuid;
  v_silver uuid;
  v_bronze uuid;
begin
  if not public.has_permission('events', 'manage') then
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
$$;

create or replace function public.giveaway_ticket_totals(
  p_giveaway_id uuid,
  p_donation_id uuid default null,
  p_sale_id uuid default null
)
returns table (tier_id uuid, tier_key text, tier_label text, tier_rank integer, quantity bigint)
language sql
security definer
set search_path = public
stable
as $$
  select t.id, t.key, t.label, t.rank, coalesce(sum(g.quantity), 0)::bigint
  from public.giveaway_tiers t
  left join public.giveaway_ticket_grants g
    on g.ticket_tier_id = t.id
   and (p_donation_id is null or g.donation_id = p_donation_id)
   and (p_sale_id is null or g.sale_id = p_sale_id)
  where t.giveaway_id = p_giveaway_id
    and t.tenant_id = (select public.current_tenant_id())
    and public.has_permission('events', 'view')
  group by t.id, t.key, t.label, t.rank
  order by t.rank;
$$;

create or replace function public.record_giveaway_ticket_sale(
  p_giveaway_id uuid,
  p_package_id uuid,
  p_quantity integer,
  p_purchaser_person_id uuid default null,
  p_sold_at timestamptz default null,
  p_notes text default null
)
returns table (sale_id uuid, amount numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_price numeric(10, 2);
  v_tier_id uuid;
  v_bundle integer;
  v_is_active boolean;
  v_sale_id uuid;
  v_amount numeric(10, 2);
begin
  if not public.has_permission('events', 'manage') then
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
$$;

create or replace function public.create_giveaway_prize(
  p_giveaway_id uuid,
  p_prize_name text,
  p_donor_person_id uuid default null,
  p_estimated_value numeric default null,
  p_notes text default null,
  p_source_inventory_item_id uuid default null,
  p_source_monetary_donation_id uuid default null
)
returns uuid
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
$$;

create or replace function public.update_giveaway_prize(
  p_prize_id uuid,
  p_prize_name text,
  p_donor_person_id uuid default null,
  p_estimated_value numeric default null,
  p_notes text default null,
  p_source_inventory_item_id uuid default null,
  p_source_monetary_donation_id uuid default null
)
returns void
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
$$;

create or replace function public.delete_giveaway_prize(p_prize_id uuid)
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
  where gp.id = p_prize_id
    and gp.tenant_id = (select public.current_tenant_id());

  if not found then
    return;
  end if;

  delete from public.giveaway_prizes where id = p_prize_id;

  perform public.release_inventory_item_from_giveaway(v_item_id, v_event_id);
end;
$$;

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
    and gp.tenant_id = (select public.current_tenant_id())
    and (gp.source_inventory_item_id is not null or gp.source_monetary_donation_id is not null);

  return v_result;
end;
$$;

create or replace function public.list_available_giveaway_sources(
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
  v_tenant_id uuid := public.current_tenant_id();
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
$$;

-- Inventory ------------------------------------------------------------------------

create or replace function public.record_event_distribution(
  p_inventory_item_id uuid,
  p_quantity integer,
  p_reason text,
  p_event_id uuid default null,
  p_recipient_person_id uuid default null,
  p_occurred_at timestamptz default now(),
  p_mark_item_distributed boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_movement_id uuid;
  v_tenant_id uuid := public.current_tenant_id();
begin
  if not (public.has_permission('inventory', 'manage') or public.has_permission('inventory_intake', 'manage')) then
    raise exception 'Not authorized to record a distribution';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantity must be greater than zero';
  end if;
  if not exists (
    select 1 from public.inventory_items where id = p_inventory_item_id and tenant_id = v_tenant_id
  ) then
    raise exception 'Inventory item not found';
  end if;

  insert into public.inventory_movements
    (inventory_item_id, movement_type, quantity, occurred_at, reason, event_id, recipient_person_id)
  values
    (p_inventory_item_id, 'distributed', p_quantity, coalesce(p_occurred_at, now()), p_reason, p_event_id, p_recipient_person_id)
  returning id into v_movement_id;

  if p_mark_item_distributed then
    update public.inventory_items set status = 'distributed'
     where id = p_inventory_item_id and tenant_id = v_tenant_id;
  end if;

  return v_movement_id;
end;
$$;

create or replace function public.create_donation_with_items(
  p_donor_name text,
  p_donor_is_anonymous boolean,
  p_donor_source_type text,
  p_donor_email text,
  p_donor_phone text,
  p_donor_notes text,
  p_items jsonb,
  p_event_id uuid default null
)
returns table (donation_id uuid, inventory_item_ids uuid[], giveaway_id uuid, untiered_item_ids uuid[])
language plpgsql
security definer
set search_path = public
as $$
declare
  v_donor_id uuid;
  v_donation_id uuid;
  v_item_id uuid;
  v_item jsonb;
  v_item_ids uuid[] := '{}';
  v_giveaway_id uuid;
  v_tier_id uuid;
  v_tier_key text;
  v_untiered uuid[] := '{}';
  v_category_id uuid;
  v_tier_text text;
  v_tenant_id uuid := public.current_tenant_id();
begin
  if not (public.has_permission('finance', 'manage') or public.has_permission('inventory_intake', 'manage')) then
    raise exception 'Not authorized to record a donation';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 then
    raise exception 'At least one item is required';
  end if;

  if p_event_id is not null and not exists (
    select 1 from public.events where id = p_event_id and tenant_id = v_tenant_id
  ) then
    raise exception 'Event not found';
  end if;

  if p_donor_is_anonymous or p_donor_email is null or p_donor_email = '' then
    insert into public.people (name, is_anonymous, source_type, email, phone, notes)
    values (p_donor_name, p_donor_is_anonymous, p_donor_source_type, p_donor_email, p_donor_phone, p_donor_notes)
    returning id into v_donor_id;
  else
    v_donor_id := public.resolve_or_create_person_by_email(
      p_donor_name, p_donor_email, p_donor_phone, p_donor_notes, p_donor_source_type, null
    );
  end if;

  insert into public.donations (donor_id, event_id)
  values (v_donor_id, p_event_id)
  returning id into v_donation_id;

  if p_event_id is not null then
    select g.id into v_giveaway_id
    from public.giveaways g
    where g.event_id = p_event_id
      and g.tenant_id = v_tenant_id
      and exists (select 1 from public.giveaway_tiers t where t.giveaway_id = g.id);
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_category_id := null;
    if nullif(v_item->>'category_key', '') is not null then
      select c.id into v_category_id
      from public.inventory_categories c
      where c.key = v_item->>'category_key'
        and c.tenant_id = v_tenant_id;
    end if;
    if v_category_id is null then
      v_category_id := public.resolve_inventory_category(v_item->>'type', v_tenant_id);
    end if;

    insert into public.inventory_items
      (donation_id, description, size, type, gender, condition, face_value, notes, intended_use, category_id)
    values (
      v_donation_id,
      v_item->>'description',
      v_item->>'size',
      v_item->>'type',
      v_item->>'gender',
      v_item->>'condition',
      nullif(v_item->>'face_value', '')::numeric,
      v_item->>'notes',
      coalesce(nullif(v_item->>'intended_use', ''), 'gear_library'),
      v_category_id
    )
    returning id into v_item_id;

    v_item_ids := array_append(v_item_ids, v_item_id);

    insert into public.inventory_movements (inventory_item_id, movement_type, quantity, reason)
    values (v_item_id, 'received', 1, 'Donation intake');

    if v_giveaway_id is not null then
      v_tier_id := null;
      v_tier_key := nullif(v_item->>'giveaway_tier', '');

      if v_tier_key is not null then
        select t.id into v_tier_id
        from public.giveaway_tiers t
        where t.giveaway_id = v_giveaway_id and t.key = v_tier_key;
      end if;

      if v_tier_id is null then
        select concat_ws(' ', g.label, c.label, v_item->>'type')
        into v_tier_text
        from public.inventory_categories c
        join public.inventory_category_groups g on g.id = c.group_id
        where c.id = v_category_id;

        v_tier_id := public.suggest_giveaway_tier(
          v_giveaway_id, coalesce(v_tier_text, v_item->>'type')
        );
      end if;

      if v_tier_id is null then
        v_untiered := array_append(v_untiered, v_item_id);
      else
        perform public.grant_giveaway_tickets(
          v_giveaway_id, v_tier_id, 1, v_donation_id, v_item_id, null
        );
      end if;
    end if;
  end loop;

  return query select v_donation_id, v_item_ids, v_giveaway_id, v_untiered;
end;
$$;

-- People ---------------------------------------------------------------------------

create or replace function public.set_person_role_tags(p_person_id uuid, p_roles text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.has_permission('people', 'manage')
          or public.has_permission('people_intake', 'manage')) then
    raise exception 'Not authorized';
  end if;

  if not exists (
    select 1 from public.people
     where id = p_person_id and tenant_id = (select public.current_tenant_id())
  ) then
    raise exception 'No such person';
  end if;

  if exists (
    select 1 from unnest(coalesce(p_roles, '{}'::text[])) as role
     where role not in ('donor', 'sponsor', 'volunteer', 'attendee', 'staff', 'partner')
  ) then
    raise exception 'Unknown role';
  end if;

  delete from public.person_role_tags
   where person_id = p_person_id
     and role <> all (coalesce(p_roles, '{}'::text[]));

  insert into public.person_role_tags (person_id, role)
  select p_person_id, role from unnest(coalesce(p_roles, '{}'::text[])) as role
  on conflict (person_id, role) do nothing;
end;
$$;

create or replace function public.delete_rider_profile(p_person_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run_id uuid;
begin
  if not (public.has_permission('events', 'manage')
          or public.has_permission('people', 'manage')) then
    raise exception 'Not authorized';
  end if;

  if not exists (
    select 1 from public.people
     where id = p_person_id and tenant_id = (select public.current_tenant_id())
  ) then
    raise exception 'No such person';
  end if;

  update public.event_registrations r
     set riding_discipline_at_event = p.riding_discipline,
         ski_experience_level_at_event = p.ski_experience_level,
         snowboard_experience_level_at_event = p.snowboard_experience_level
    from public.people p
   where p.id = r.person_id
     and p.id = p_person_id
     and r.checked_in_at is not null
     and r.riding_discipline_at_event is null
     and p.riding_discipline is not null;

  update public.people
     set riding_discipline = null,
         ski_experience_level = null,
         snowboard_experience_level = null,
         preferred_mountain = null
   where id = p_person_id;

  insert into public.retention_runs
    (as_of, dry_run, trigger, triggered_by, reason, status, finished_at)
  values (now(), false, 'request', auth.uid(), p_reason, 'succeeded', now())
  returning id into v_run_id;

  perform public.retention_log(
    v_run_id, 'rider_profiles', 'people', 'cleared',
    array[p_person_id], p_person_id
  );
end;
$$;

-- person_role_flags() is executable by any authenticated user because
-- people_with_roles is a security_invoker view that calls it per row. Called
-- directly with another tenant's person id it answered honestly; now every
-- flag is false unless the person is in the caller's current tenant. Through
-- the view nothing changes: a row the view can show is already in that
-- tenant.
create or replace function public.person_role_flags(p_person_id uuid)
returns table (
  is_donor boolean, is_sponsor boolean, is_volunteer boolean,
  is_attendee boolean, is_staff boolean, is_partner boolean
)
language sql
security definer
set search_path = public
stable
parallel safe
as $$
  with scope as (
    select exists (
      select 1 from public.people
       where id = p_person_id and tenant_id = (select public.current_tenant_id())
    ) as ok
  )
  select
    ok and (
      exists (select 1 from public.donations where donor_id = p_person_id)
      or exists (select 1 from public.monetary_donations where donor_id = p_person_id)
      or exists (select 1 from public.giveaway_prizes where donor_person_id = p_person_id)
      or exists (select 1 from public.person_role_tags
                  where person_id = p_person_id and role = 'donor')
    ),

    ok and (
      exists (select 1 from public.event_sponsors where person_id = p_person_id)
      or exists (select 1 from public.person_role_tags
                  where person_id = p_person_id and role = 'sponsor')
    ),

    ok and (
      exists (select 1 from public.event_volunteers where person_id = p_person_id)
      or exists (select 1 from public.volunteer_hours where person_id = p_person_id)
      or exists (select 1 from public.volunteer_applications where person_id = p_person_id)
      or exists (select 1 from public.person_role_tags
                  where person_id = p_person_id and role = 'volunteer')
    ),

    ok and (
      exists (select 1 from public.event_registrations where person_id = p_person_id)
      or exists (select 1 from public.person_role_tags
                  where person_id = p_person_id and role = 'attendee')
    ),

    ok and (
      exists (select 1 from public.event_staff where person_id = p_person_id)
      or exists (select 1 from public.person_role_tags
                  where person_id = p_person_id and role = 'staff')
    ),

    ok and (
      exists (select 1 from public.partnership_opportunities
               where organization_person_id = p_person_id
                 and stage = 'closed_won')
      or exists (select 1 from public.person_role_tags
                  where person_id = p_person_id and role = 'partner')
    )
  from scope;
$$;

-- person_last_activity_at() is a retention helper (20260905110000) with no
-- caller outside the purge, which runs as the function owner. Its default
-- execute grant to PUBLIC let any signed-in user probe activity timestamps by
-- person id, in any tenant.
revoke execute on function public.person_last_activity_at(uuid) from public, anon, authenticated;

-- Calendar -------------------------------------------------------------------------

create or replace function public.get_calendar_annual_review_data(p_from date, p_to date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item_ids uuid[];
  v_result jsonb;
begin
  if not public.has_permission('content_calendar_reports', 'view') then
    raise exception 'Not authorized to view the annual calendar review report';
  end if;

  if p_from > p_to then
    raise exception 'The start of the range must not be after its end';
  end if;

  select coalesce(array_agg(id), '{}') into v_item_ids
  from public.calendar_items
  where tenant_id = (select public.current_tenant_id())
    and starts_at >= (p_from::timestamp at time zone 'UTC')
    and starts_at < ((p_to + 1)::timestamp at time zone 'UTC');

  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id,
        'priority_tier', priority_tier,
        'decision', decision,
        'visibility', visibility,
        'calendar_status', calendar_status
      ))
      from public.calendar_items
      where id = any(v_item_ids)
    ), '[]'::jsonb),
    'opportunities', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id,
        'calendar_item_id', calendar_item_id,
        'content_status', content_status,
        'chatter_connection', chatter_connection,
        'template_id', template_id,
        'draft_due_at', draft_due_at,
        'review_due_at', review_due_at,
        'publish_due_at', publish_due_at,
        'created_at', created_at,
        'status_changed_at', status_changed_at
      ))
      from public.content_opportunities
      where calendar_item_id = any(v_item_ids)
    ), '[]'::jsonb),
    'permissions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'content_opportunity_id', p.content_opportunity_id
      ))
      from public.content_permissions p
      join public.content_opportunities co on co.id = p.content_opportunity_id
      where co.calendar_item_id = any(v_item_ids)
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;
