-- Issue #602, part 2 of 6: the evidence trail.
--
-- The ticket asks for "a dry-run mode plus a log of what each run deleted or
-- anonymized (counts per table), so the board can see the policy is actually
-- being applied and a mistake is recoverable in review before it isn't." These
-- two tables are that log, and they are what makes dry_run worth having: a run
-- that changes nothing still records exactly what it would have changed.
--
-- Counts and row ids only -- never a name, an email or a free-text note. That
-- is deliberate: a log of a privacy purge that itself accumulated personal data
-- would need its own retention clock, and would be the sort of thing this
-- ticket exists to prevent.

create table public.retention_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  -- The clock the run was evaluated against. Normally now(); the integration
  -- tests move it, and recording it is what makes those runs legible here.
  as_of timestamptz not null,
  dry_run boolean not null,
  trigger text not null check (trigger in ('cron', 'manual', 'request')),
  -- Null under cron: auth.uid() is null inside a pg_cron job, there being no
  -- request and no JWT. Rendered as "Scheduled".
  triggered_by uuid references auth.users(id),
  -- Why an on-request deletion was actioned. Null for scheduled runs.
  reason text,
  status text not null default 'running'
    check (status in ('running', 'succeeded', 'partial', 'failed')),
  error text
);

create index retention_runs_started_at_idx on public.retention_runs (started_at desc);

create table public.retention_run_tables (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.retention_runs(id) on delete cascade,
  -- No FK to retention_policies: a policy the board retires must not take its
  -- own history with it. Same reasoning person_merges (20260904180000) records
  -- for holding ids of rows that no longer exist.
  policy_key text not null,
  table_name text not null,
  action text not null
    check (action in ('deleted', 'anonymized', 'cleared', 'backfilled', 'skipped')),
  row_count integer not null default 0,
  -- Up to 20 affected ids. This is what turns a dry run from a number into
  -- something a reviewer can act on: "417 rows" is not checkable, but twenty
  -- ids to go and look at are.
  sample_ids uuid[] not null default '{}',
  -- Set only by the on-request path, so a subject-access request can be
  -- answered from this table alone. Null for scheduled runs.
  subject_person_id uuid references public.people(id),
  error text
);

create index retention_run_tables_run_id_idx on public.retention_run_tables (run_id);

alter table public.retention_runs enable row level security;
alter table public.retention_run_tables enable row level security;

-- RLS posture copied from audit_log (20260822120000): readable by
-- administration managers, and no insert/update/delete policy for anyone. Only
-- the security definer purge functions write, which makes this append-only from
-- the API's perspective -- a log a portal user could edit would not be evidence
-- of anything.
create policy "retention_runs select" on public.retention_runs
  for select to authenticated
  using (public.has_permission('administration', 'manage'));

create policy "retention_run_tables select" on public.retention_run_tables
  for select to authenticated
  using (public.has_permission('administration', 'manage'));

grant select on public.retention_runs to authenticated;
grant select on public.retention_run_tables to authenticated;
