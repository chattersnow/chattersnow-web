-- Deleting an event from the ops portal (issue: "add the ability to delete
-- events"). The "events delete" RLS policy from 20260822100000 already lets
-- any events:manage holder delete a row, but nothing guarded what that
-- destroys: 10 child tables cascade away (registrations, sponsors, staff,
-- volunteers, shifts, incidents, discount codes, the giveaway and its
-- prizes/winners), and 7 more are set to NULL, silently orphaning donations,
-- expenses, revenue and reimbursements out of the finance and program-impact
-- rollups without any trace.
--
-- So delete is scoped as an undo-a-mistake tool: an event may only be deleted
-- while nothing meaningful is attached to it. Anything with real history keeps
-- using status = 'cancelled' / 'archived', which already exists.
--
-- Enforced by a BEFORE DELETE trigger rather than a check in the Server
-- Action, per spec §7 -- a raw PostgREST delete from any events:manage holder
-- has to hit the same guard, not just the portal's own code path.

-- The blocker registry. Each entry is a table with an `event_id` column whose
-- rows either vanish with the event (cascade) or outlive it orphaned (set
-- null); either way its presence blocks the delete. Adding a relation later is
-- a one-line change here.
--
-- Deliberately absent, so a half-filled draft stays deletable: event_logistics,
-- event_impact_notes and event_checklist_items are per-event detail with no
-- meaning apart from the event. giveaway_prizes/giveaway_winners are absent
-- because they're only reachable through `giveaways`, which does block --
-- important, since 20260901070000 reserves inventory_items for prizes and
-- cascading them away would strand that inventory in `reserved`.
create function public.event_linked_record_labels(p_id uuid)
returns text[]
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_labels text[] := '{}';
  v_count bigint;
  v_rel record;
begin
  for v_rel in
    select * from (values
      -- on delete cascade: these rows would be destroyed with the event
      ('event_registrations',   'registrant',                 'registrants'),
      ('event_sponsors',        'sponsor',                    'sponsors'),
      ('event_staff',           'staff assignment',           'staff assignments'),
      ('event_volunteers',      'volunteer signup',           'volunteer signups'),
      ('event_volunteer_hours', 'volunteer hours entry',      'volunteer hours entries'),
      ('event_shifts',          'shift',                      'shifts'),
      ('event_incidents',       'incident',                   'incidents'),
      ('discount_codes',        'discount code',              'discount codes'),
      ('giveaways',             'giveaway',                   'giveaways'),
      -- on delete set null: these rows would survive, orphaned
      ('donations',             'linked donation',            'linked donations'),
      ('monetary_donations',    'linked monetary donation',   'linked monetary donations'),
      ('inventory_movements',   'linked inventory movement',  'linked inventory movements'),
      ('event_expenses',        'linked expense',             'linked expenses'),
      ('event_revenue',         'linked revenue entry',       'linked revenue entries'),
      ('reimbursements',        'linked reimbursement',       'linked reimbursements'),
      ('volunteer_hours',       'linked volunteer hours entry', 'linked volunteer hours entries')
    ) as t(table_name, singular, plural)
  loop
    -- %I over a literal from the list above, so there's no injection surface.
    execute format('select count(*) from public.%I where event_id = $1', v_rel.table_name)
      into v_count using p_id;

    if v_count > 0 then
      v_labels := v_labels || format(
        '%s %s',
        v_count,
        case when v_count = 1 then v_rel.singular else v_rel.plural end
      );
    end if;
  end loop;

  return v_labels;
end;
$$;

-- Internal: read by the trigger and by the permission-guarded RPC below, never
-- called directly from the client.
revoke all on function public.event_linked_record_labels(uuid) from public;

create function public.prevent_event_delete_with_records()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_labels text[];
begin
  v_labels := public.event_linked_record_labels(old.id);

  if coalesce(array_length(v_labels, 1), 0) > 0 then
    raise exception
      'This event still has linked records (%). Set its status to Cancelled or Archived instead of deleting it.',
      array_to_string(v_labels, ', ')
      using errcode = 'restrict_violation';
  end if;

  return old;
end;
$$;

-- BEFORE, so it runs ahead of both the FK cascade and the audit trigger below:
-- a refused delete leaves no child rows touched and no audit entry.
create trigger prevent_delete_with_records before delete on public.events
  for each row execute function public.prevent_event_delete_with_records();

-- Read side for the portal: lets the detail page explain what's blocking a
-- delete before the user opens the confirm dialog. Security definer so the
-- counts are complete even for the tables the caller's own role can't select
-- (a coordinator has no finance:view), gated on the same permission the delete
-- itself requires.
create function public.event_delete_blockers(p_id uuid)
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

  return public.event_linked_record_labels(p_id);
end;
$$;

revoke all on function public.event_delete_blockers(uuid) from public;
grant execute on function public.event_delete_blockers(uuid) to authenticated;

-- Events were never in the audited set (spec §5.11 called this out as a known
-- gap), so until now an edit or delete left no trace. A destructive action
-- shouldn't ship without one.
insert into public.audited_tables (table_name) values ('events');
create trigger audit_log_row after insert or update or delete on public.events
  for each row execute function public.audit_log_row();
