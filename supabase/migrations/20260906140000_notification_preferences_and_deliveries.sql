-- Issue #488, part 1 of 1: the schema behind the app's first outbound email.
--
-- Nothing in this application has ever sent mail. This migration adds the two
-- tables that decide whether a message may be sent and record that it was,
-- plus one helper the policies cannot do without. The send helper, the cron
-- route and the digest itself are application code; everything that has to be
-- true regardless of which caller is asking lives here.
--
-- 1. person_notification_preferences -- who wants to hear from us, per kind.
--
--    Not more app_settings rows: app_settings is org-scoped (one row per
--    tenant per key) and this is per person per kind, so it would need a
--    synthetic key like `notifications.task_digest.<person_id>` and would lose
--    the foreign key that keeps a preference pointing at a real person in the
--    same tenant. `kind` is free text against a check pattern rather than an
--    enum so #742 (volunteer applications, contact messages) and #743 (the
--    leadership ops report) add rows, not migrations.
--
--    Default is opt-in: no row means no email. `people` is a directory, not a
--    staff list -- it holds donor, sponsor, organization and anonymous rows
--    created by the public intake RPCs, and none of those people asked to hear
--    from us. That is why `enabled` defaults to true but the *absence* of a
--    row is what the sender checks.
--
-- 2. notification_deliveries -- what was actually sent, and to whom.
--
--    The ledger is the idempotency mechanism, not just an audit trail. The
--    sender inserts the row *before* it sends: a retried or concurrent cron
--    invocation loses the unique-constraint race on
--    (tenant_id, person_id, kind, dedupe_key) and skips, instead of racing
--    between a "did we already send?" read and the send itself. The row is
--    then updated with the provider's result. It doubles as the evidence that
--    an opt-out was honored, which is why it is readable by an administrator
--    and why nothing may delete from it.
--
--    No message bodies are stored -- who, which kind, and the provider's id is
--    all that is needed to answer "did they get it?", and a digest body is a
--    list of someone's outstanding commitments.
--
-- Both tables are tenant-scoped in the Phase 3 shape (#707): every policy
-- names tenant_id and every foreign key between two tenant tables is
-- composite, or tenant_isolation_gaps() (20260906100000) reports a gap and the
-- isolation suite fails. That matters more here than almost anywhere else in
-- the schema, because the job that reads these tables runs on the service-role
-- client, which bypasses RLS entirely -- the composite key to
-- people (tenant_id, id) is what makes a cross-tenant recipient unwritable
-- even to a caller RLS is not looking at.

-- The current person, for a policy ------------------------------------------
--
-- The obvious self-scoped predicate --
--   person_id in (select id from public.people where auth_user_id = auth.uid())
-- -- does not work. The "people select" policy (20260826000000) requires
-- people:view, people_intake:manage or reimbursement_approvals:manage, and a
-- subquery inside a policy is still subject to that policy, so for a volunteer
-- it returns nothing and they could never read their own preference row.
--
-- resolve_current_person_id() (20260823140000) cannot stand in: it auto-links
-- people.auth_user_id on first use, so it writes, and a volatile function has
-- no business in a row-security predicate. This is its read-only sibling --
-- security definer to see past the people policy, stable so the planner may
-- cache it per statement, and tenant-scoped so a support session looking at
-- one tenant cannot resolve to a person in another.
create or replace function public.my_person_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select p.id
    from public.people p
   where p.auth_user_id = auth.uid()
     and p.tenant_id = public.current_tenant_id()
   limit 1;
$$;

comment on function public.my_person_id() is
  'The caller''s people.id in their current tenant, or null. Read-only counterpart to resolve_current_person_id(), safe to use in a policy.';

revoke execute on function public.my_person_id() from public;
grant execute on function public.my_person_id() to authenticated, service_role;

-- Preferences ----------------------------------------------------------------

create table public.person_notification_preferences (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) default public.default_tenant_id(),
  person_id uuid not null,
  -- The registry is NOTIFICATION_KINDS in src/lib/notifications/kinds.ts. The
  -- check only constrains the shape, the same way site_content.key does.
  kind text not null check (kind ~ '^[a-z0-9_]+$'),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id),
  -- set_updated_at() writes updated_by as well as updated_at, so a table
  -- carrying that trigger has to have the column or every update fails.
  updated_by uuid references auth.users(id),
  unique (tenant_id, person_id, kind),
  unique (tenant_id, id),
  foreign key (tenant_id, person_id)
    references public.people (tenant_id, id) on delete cascade
);

comment on table public.person_notification_preferences is
  'Per-person, per-kind opt-in for outbound email (#488). No row means no email; a row with enabled = false is the record that an opt-out was honored.';

create index person_notification_preferences_tenant_id_idx
  on public.person_notification_preferences (tenant_id);
create index person_notification_preferences_person_id_idx
  on public.person_notification_preferences (person_id);

create trigger set_updated_at before update on public.person_notification_preferences
  for each row execute function public.set_updated_at();

alter table public.person_notification_preferences enable row level security;

-- Self-scoped, plus an administrator's read. Deliberately no self-delete:
-- turning a digest off writes enabled = false, which is the evidence the
-- opt-out was honored; deleting the row would erase it.
create policy "person_notification_preferences select" on public.person_notification_preferences for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and (
      person_id = (select public.my_person_id())
      or public.has_permission('administration', 'manage')
    )
  );
create policy "person_notification_preferences insert" on public.person_notification_preferences for insert to authenticated
  with check (
    tenant_id = (select public.current_tenant_id())
    and person_id = (select public.my_person_id())
  );
create policy "person_notification_preferences update" on public.person_notification_preferences for update to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and person_id = (select public.my_person_id())
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and person_id = (select public.my_person_id())
  );
-- Administrator-only delete, for one specific situation: merge_people()
-- (20260906080000) raises on a unique_violation rather than dropping a row, so
-- merging two people who each hold a preference for the same kind is blocked
-- until one of them is cleared, and there is no other way to clear it.
create policy "person_notification_preferences delete" on public.person_notification_preferences for delete to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('administration', 'manage')
  );

grant select, insert, update, delete on public.person_notification_preferences to authenticated;

-- Deliveries -----------------------------------------------------------------

create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) default public.default_tenant_id(),
  person_id uuid not null,
  kind text not null,
  -- What makes a send unique within its kind. 'task-digest:YYYY-MM-DD' here;
  -- an event-triggered send (#742) will key on the row that triggered it.
  dedupe_key text not null,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed', 'skipped')),
  provider_message_id text,
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (tenant_id, person_id, kind, dedupe_key),
  unique (tenant_id, id),
  foreign key (tenant_id, person_id)
    references public.people (tenant_id, id) on delete cascade
);

comment on table public.notification_deliveries is
  'One row per attempted outbound message (#488). Written before the send so a concurrent retry loses the unique-constraint race and skips. No message bodies.';

create index notification_deliveries_tenant_id_idx
  on public.notification_deliveries (tenant_id);
create index notification_deliveries_person_id_idx
  on public.notification_deliveries (person_id);

-- No set_updated_at trigger: this is an append-then-finalize ledger, not a
-- record anyone edits, so created_at and sent_at say everything.

alter table public.notification_deliveries enable row level security;

-- Read-only, and only for an administrator. Every row is written by the
-- service-role sender, which RLS does not apply to, so there is deliberately
-- no insert/update/delete policy for authenticated at all -- a signed-in
-- session has no legitimate reason to forge or amend a delivery record.
create policy "notification_deliveries select" on public.notification_deliveries for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('administration', 'manage')
  );

grant select on public.notification_deliveries to authenticated;

-- Kill switch view -----------------------------------------------------------
--
-- app_settings' select policy admits only the managers of the handful of
-- resources that read it (20260906040000), so an ordinary user cannot read the
-- org-wide switch -- but /portal/account needs it, to explain why an enabled
-- toggle is currently sending nothing. Same shape and same reason as
-- org_fiscal_year.
create or replace view public.org_notification_settings as
select (value #>> '{}')::boolean as email_enabled
from public.app_settings
where key = 'notifications.email_enabled'
  and tenant_id = public.current_tenant_id();

grant select on public.org_notification_settings to authenticated;

-- Audit ----------------------------------------------------------------------
--
-- The preference table because an opt-in and an opt-out are both consent
-- records; the ledger because "we sent it" is exactly the kind of claim that
-- needs a trail underneath it.
insert into public.audited_tables (table_name) values
  ('person_notification_preferences'),
  ('notification_deliveries');

create trigger audit_log_row after insert or update or delete on public.person_notification_preferences
  for each row execute function public.audit_log_row();
create trigger audit_log_row after insert or update or delete on public.notification_deliveries
  for each row execute function public.audit_log_row();

-- Self-check, the same one 20260906130000 runs: neither new table may have
-- opened an isolation gap.
do $$
declare
  v_gaps text;
begin
  select string_agg(p.tablename || '."' || p.policyname || '"', ', ') into v_gaps
  from pg_policies p
  where p.schemaname = 'public'
    and p.tablename in ('person_notification_preferences', 'notification_deliveries')
    and coalesce(p.qual, '') !~ 'tenant_id'
    and coalesce(p.with_check, '') !~ 'tenant_id';
  if v_gaps is not null then
    raise exception 'Notification policies without a tenant predicate: %', v_gaps;
  end if;
end $$;
