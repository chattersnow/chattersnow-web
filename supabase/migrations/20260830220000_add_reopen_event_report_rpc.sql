-- Issue #526: once event.report_status is 'submitted', Overview/Planning/
-- Report become permanently read-only (LOCKED_ON_REPORT_SUBMIT_TABS,
-- closing #348) with no way back -- not even for admins. Add a controlled,
-- audited escape hatch: an admin-only RPC that reopens a submitted report,
-- requiring a reason (mirrors reject_event_expense's required p_reason) and
-- recording who/when (mirrors event_expenses.approved_by/approved_at).
alter table public.events
  add column report_reopened_at timestamptz,
  add column report_reopened_by uuid references auth.users(id),
  add column report_reopen_reason text;

create function public.reopen_event_report(p_id uuid, p_reason text)
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

  select * into v_event from public.events where id = p_id for update;
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

grant execute on function public.reopen_event_report(uuid, text) to authenticated;
