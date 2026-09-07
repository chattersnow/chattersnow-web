-- Consolidation. 20260822040000 called event_volunteer_hours a "lightweight,
-- event-scoped stand-in for the fuller volunteer_hours table ... until callers
-- migrate", and 20260823030000 said it stays "until callers migrate". This is
-- that migration.
--
-- The split was silently wrong, not merely redundant. The Program Impact
-- Report (get_program_impact_rollup_data, 20260901040000), Volunteers >
-- Participation (listVolunteerHoursAction), and the person profile's Volunteer
-- activity card all read public.volunteer_hours only -- so every hour logged
-- from the event editor's Volunteers tab was visible on that one tab and
-- nowhere else in the portal. 20260823110000's own header states that spec
-- §5.15 sources volunteer hours from event_volunteer_hours, and omits an hours
-- column from event_impact_notes precisely to avoid "two disagreeing sources
-- of truth"; the rollup then read the other table. One ledger, one number.

-- 1. Backfill. id is preserved: no FK points at event_volunteer_hours, but
-- keeping it makes this insert idempotent via `on conflict do nothing` and
-- keeps any externally-recorded id resolvable after the drop below. logged_by
-- must be copied explicitly -- the target column is `not null` and its
-- auth.uid() default is null inside a migration. volunteer_role_type_id and
-- updated_by land null; the source table never had them.
--
-- No de-duplication is attempted. The two tables were never written in tandem
-- by any code path, so a mechanical duplicate cannot exist, and silently
-- dropping a legitimate second entry for the same person/event/day would be
-- worse than an over-count.
--
-- to_regclass guard so this is safe to re-run against a database where the
-- table is already gone.
do $$
begin
  if to_regclass('public.event_volunteer_hours') is not null then
    execute $q$
      insert into public.volunteer_hours (
        id, person_id, event_id, volunteer_role_type_id,
        hours, logged_date, notes, logged_by, created_at, updated_at
      )
      select
        evh.id, evh.person_id, evh.event_id, null,
        evh.hours, evh.logged_date, evh.notes, evh.logged_by,
        evh.created_at, evh.updated_at
      from public.event_volunteer_hours evh
      on conflict (id) do nothing
    $q$;
  end if;
end $$;

-- The rollup filters `event_id = any(...)` and event_linked_record_labels()
-- counts per event; only person_id was indexed (20260903030000).
create index if not exists volunteer_hours_event_id_idx
  on public.volunteer_hours (event_id);

-- 2. Access has to survive the merge unchanged. Two resources gated these
-- rows: `volunteers` (the org-wide ledger) and `event_volunteer_hours` (the
-- event tab). Dropping either gate regresses somebody -- event_coordinator
-- holds event_volunteer_hours:manage but only volunteers:view, and finance
-- holds event_volunteer_hours:view but volunteers:none. So the
-- event_volunteer_hours resource outlives its table: it now means "event-linked
-- rows of the shared ledger", OR'd in wherever event_id is not null.
--
-- Rows with event_id is null short-circuit that branch and land on exactly
-- today's volunteer_hours policy, so the org-wide ledger is not widened.
-- Row-level "own hours only" filtering stays absent, as it was on both tables
-- (see 20260823030000's header) -- this migration is not the place to add it.
drop policy "volunteer_hours select" on public.volunteer_hours;
drop policy "volunteer_hours insert" on public.volunteer_hours;
drop policy "volunteer_hours update" on public.volunteer_hours;
drop policy "volunteer_hours delete" on public.volunteer_hours;

create policy "volunteer_hours select" on public.volunteer_hours for select to authenticated
  using (
    public.has_permission('volunteers', 'view')
    or (event_id is not null and public.has_permission('event_volunteer_hours', 'view'))
  );

create policy "volunteer_hours insert" on public.volunteer_hours for insert to authenticated
  with check (
    public.has_permission('volunteers', 'manage')
    or public.has_permission('volunteer_hours_logging', 'manage')
    or (event_id is not null and public.has_permission('event_volunteer_hours', 'manage'))
  );

-- using() reads the old row, with check() the new one, so an event-only holder
-- cannot lift a row out of event scope (event_id -> null) to escape their gate.
create policy "volunteer_hours update" on public.volunteer_hours for update to authenticated
  using (
    public.has_permission('volunteers', 'manage')
    or (event_id is not null and public.has_permission('event_volunteer_hours', 'manage'))
  )
  with check (
    public.has_permission('volunteers', 'manage')
    or (event_id is not null and public.has_permission('event_volunteer_hours', 'manage'))
  );

create policy "volunteer_hours delete" on public.volunteer_hours for delete to authenticated
  using (
    public.has_permission('volunteers', 'manage')
    or (event_id is not null and public.has_permission('event_volunteer_hours', 'manage'))
  );

-- 3. The resource row stays: it is now the permission concept the OR-branches
-- above key on, and Administration > Permissions renders straight from this
-- table -- deleting it would cascade role_permissions away and silently strip
-- coordinator/finance access. Only the description changes, so a future reader
-- doesn't go looking for a table that isn't there.
update public.resources
set description = 'Event-scoped access to the shared volunteer hours log (rows linked to an event)'
where key = 'event_volunteer_hours';

-- 4. event_volunteer_hours leaves the delete-guard registry with its table.
-- The registry is dynamic (format('... from public.%I ...')), so a stale entry
-- would not fail here -- it would raise the first time anyone deleted an event.
-- volunteer_hours was already listed on the set-null side, so an event with
-- hours still blocks; what changes is the label, and that a deleted event's
-- hours would now be orphaned rather than destroyed -- for a grant-reporting
-- ledger, the better failure mode, and exactly why it blocks.
create or replace function public.event_linked_record_labels(p_id uuid)
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

revoke all on function public.event_linked_record_labels(uuid) from public;

-- 5. Drop last: takes its four policies and its set_updated_at trigger with it.
-- No views, no FKs, and it was never in audited_tables.
drop table if exists public.event_volunteer_hours;
