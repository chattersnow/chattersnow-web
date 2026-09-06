-- Multi-tenancy Phase 5b (#707): make the retention rules a tenant's own.
--
-- Phase 2 (20260906010000) deliberately left retention_policies, retention_runs
-- and retention_run_tables global: "the purge is one nightly platform sweep with
-- no session", and per-tenant policies were listed as a Phase 4 provisioning
-- item. Phase 4 did not do it, and 20260906090000's own header recorded the
-- consequence in the security-definer audit -- trigger_retention_run and
-- set_retention_policy_mode were left "global by design ... revisit when Phase 4
-- makes policies per tenant".
--
-- That leftover is not cosmetic. Both functions are `grant execute ... to
-- authenticated`, gated only on has_permission('administration','manage'), and
-- both act on a global table:
--
--   set_retention_policy_mode('event_registrations', 'enforce')
--   trigger_retention_run(p_dry_run => false)
--
-- Nothing in the RPC stops the second argument; the portal action passes
-- p_dry_run => true, but the caller is not obliged to. So any tenant's admin
-- could turn on and run a purge over every tenant's donor and participant data.
-- Harmless while Chatter Snow is the only tenant and its admins are trusted; it
-- is the last standing cross-tenant control, and it has to go before a second
-- tenant exists -- a white-label customer, or the demo tenant, where the admin
-- is an anonymous visitor.
--
-- It is also the cheapest this will ever be: every policy still ships
-- mode = 'dry_run' (#722 is not actioned), so scoping the rules changes no data
-- and no behaviour. This migration moves the tables; 20260906170000 rewrites
-- the purge itself.

-- The audit trigger on retention_policies (20260905150000) fires per row, and
-- the backfill below touches every row twice. Muting it keeps the audit trail
-- as the history of *decisions* -- who turned a rule on, and when -- rather
-- than a record of this migration. Re-enabled at the end of the block.
alter table public.retention_policies disable trigger audit_log_row;

alter table public.retention_policies   add column tenant_id uuid references public.tenants(id);
alter table public.retention_runs       add column tenant_id uuid references public.tenants(id);
alter table public.retention_run_tables add column tenant_id uuid references public.tenants(id);

-- The rules and the runs that exist right now were made under a single-tenant
-- database, so they belong to the tenant 20260905190000 created.
update public.retention_policies
   set tenant_id = (select id from public.tenants order by created_at limit 1);
update public.retention_runs
   set tenant_id = (select id from public.tenants order by created_at limit 1);
update public.retention_run_tables t
   set tenant_id = r.tenant_id
  from public.retention_runs r
 where r.id = t.run_id;

-- Any other tenant gets the shipped set, forced to dry_run whatever the
-- template's modes are. Enforcement is a decision each organization makes for
-- itself after reviewing its own counts (#722); inheriting somebody else's
-- answer is the one thing this must not do.
insert into public.retention_policies
  (tenant_id, policy_key, label, period, secondary_period, mode, description)
select t.id, p.policy_key, p.label, p.period, p.secondary_period, 'dry_run', p.description
  from public.tenants t
 cross join public.retention_policies p
 where p.tenant_id = (select id from public.tenants order by created_at limit 1)
   and t.id <> p.tenant_id;

alter table public.retention_policies
  alter column tenant_id set not null,
  alter column tenant_id set default public.default_tenant_id();
alter table public.retention_runs
  alter column tenant_id set not null,
  alter column tenant_id set default public.default_tenant_id();
alter table public.retention_run_tables
  alter column tenant_id set not null,
  alter column tenant_id set default public.default_tenant_id();

alter table public.retention_policies enable trigger audit_log_row;

-- policy_key is unique per tenant now, not globally.
alter table public.retention_policies
  drop constraint retention_policies_pkey,
  add constraint retention_policies_pkey primary key (tenant_id, policy_key);

-- Composite foreign keys, on the same terms as Phase 3's 106 (20260906080000):
-- row-level RLS does not stop a *reference* into another tenant, and these two
-- keys become gaps the moment the column above exists -- tenant_isolation_gaps()
-- reports every single-column foreign key between two tables that both carry
-- tenant_id, and the isolation suite asserts it empty on every run. So this is
-- required, not tidy-up.
alter table public.retention_runs
  add constraint retention_runs_tenant_id_id_key unique (tenant_id, id);

alter table public.retention_run_tables
  drop constraint retention_run_tables_run_id_fkey,
  add constraint retention_run_tables_run_id_fkey
    foreign key (tenant_id, run_id) references public.retention_runs (tenant_id, id)
    on delete cascade,
  drop constraint retention_run_tables_subject_person_id_fkey,
  add constraint retention_run_tables_subject_person_id_fkey
    foreign key (tenant_id, subject_person_id) references public.people (tenant_id, id);

create index retention_policies_tenant_idx on public.retention_policies (tenant_id);
create index retention_runs_tenant_started_idx
  on public.retention_runs (tenant_id, started_at desc);

-- ...and the consequence of that second key, which is the one place this
-- migration changes what the purge *decides* rather than which rows it sees.
--
-- retention_person_is_retained() keeps a person alive if anything references
-- them through a foreign key not listed in retention_purgeable_person_refs, and
-- the list is deliberately an allow-list so a table added later defaults to
-- retain (20260905090000 argues this at length). subject_person_id is set only
-- by the on-request deletion path (delete_rider_profile, 20260905130000) -- so
-- without this entry, asking us to delete your data would be the one act that
-- made you permanently un-anonymizable. Exactly backwards.
--
-- Listing it costs nothing: rule D2 anonymizes the people row rather than
-- deleting it, so the run-log row still points at a live person and the evidence
-- that the request was honoured survives intact.
insert into public.retention_purgeable_person_refs (table_name, column_name) values
  ('retention_run_tables', 'subject_person_id');

-- Policies. All three were `using (has_permission('administration','manage'))`
-- with no tenant term, which is the other half of what tenant_isolation_gaps()
-- reports. Still no insert/update/delete policy on any of them: written only by
-- the security definer purge, which is what makes the run log evidence.
drop policy "retention_policies select" on public.retention_policies;
create policy "retention_policies select" on public.retention_policies
  for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('administration', 'manage')
  );

drop policy "retention_runs select" on public.retention_runs;
create policy "retention_runs select" on public.retention_runs
  for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('administration', 'manage')
  );

drop policy "retention_run_tables select" on public.retention_run_tables;
create policy "retention_run_tables select" on public.retention_run_tables
  for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('administration', 'manage')
  );

-- The one write path for a policy, now scoped. `if not found` therefore means
-- "no such rule in your organization", which is the right answer for a key that
-- exists only in somebody else's.
create or replace function public.set_retention_policy_mode(
  p_policy_key text,
  p_mode text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission('administration', 'manage') then
    raise exception 'Not authorized';
  end if;

  if p_mode not in ('off', 'dry_run', 'enforce') then
    raise exception 'Unknown retention mode: %', p_mode;
  end if;

  update public.retention_policies
     set mode = p_mode,
         updated_by = auth.uid()
   where policy_key = p_policy_key
     and tenant_id = (select public.current_tenant_id());

  if not found then
    raise exception 'No such retention policy: %', p_policy_key;
  end if;
end;
$$;

-- Compares the published prose in src/lib/retention.ts against this tenant's
-- clocks. Without the predicate the `exists` would be satisfied by any tenant's
-- row, so a tenant that changed a period would still report agreement.
create or replace function public.retention_period_matches(
  p_policy_key text,
  p_period text,
  p_secondary_period text default null
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.retention_policies
     where policy_key = p_policy_key
       and tenant_id = (select public.current_tenant_id())
       and period = p_period::interval
       and secondary_period is not distinct from p_secondary_period::interval
  );
$$;

-- A tenant needs its rules from the moment it exists, or it opens
-- Administration > Data Retention to an empty page and the nightly sweep has
-- nothing to apply to it.
--
-- A trigger rather than a step inside provision_tenant(), for the reason
-- ensure_membership_for_role (20260906030000) is a trigger: a tenant created by
-- any other path -- a migration, a test fixture, a future provisioning route --
-- gets its rules too, and provision_tenant() never has to be edited again when
-- a rule is added. The clocks are platform policy transcribed from the board
-- decision record, not a per-tenant choice, so they come from the oldest tenant
-- (the same default template provision_tenant() uses) rather than from the
-- caller's template argument.
--
-- Always dry_run, whatever the source tenant's modes are. Enforcement is a
-- decision each organization makes after reviewing its own counts (#722);
-- inheriting somebody else's answer is the one thing this must not do.
create or replace function public.seed_tenant_retention_policies()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.retention_policies
    (tenant_id, policy_key, label, period, secondary_period, mode, description)
  select NEW.id, p.policy_key, p.label, p.period, p.secondary_period,
         'dry_run', p.description
    from public.retention_policies p
   where p.tenant_id = (
     select t.id from public.tenants t
      where t.id <> NEW.id
      order by t.created_at
      limit 1
   )
  on conflict (tenant_id, policy_key) do nothing;

  return NEW;
end;
$$;

create trigger seed_retention_policies after insert on public.tenants
  for each row execute function public.seed_tenant_retention_policies();

-- The historical mode changes were written before audit_log had a tenant, and
-- the audit_log select policy admits null-tenant rows on purpose (20260906040000),
-- so leaving them null would show Chatter Snow's retention decisions to every
-- tenant's admin. audit_log_row() stamps from the row from here on.
update public.audit_log
   set tenant_id = (select id from public.tenants order by created_at limit 1)
 where table_name = 'retention_policies'
   and tenant_id is null;

-- Same self-check 20260906100000 runs: refuse to leave a gap this migration
-- opened. is_admin() is false in a migration, so the queries are repeated
-- without the gate.
do $$
declare
  v_gaps text;
begin
  with tenant_tables as (
    select c.oid, c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attname = 'tenant_id' and not a.attisdropped
    where n.nspname = 'public' and c.relkind = 'r'
  ),
  gaps as (
    select 'policy ' || p.tablename || '."' || p.policyname || '"' as gap
    from pg_policies p
    join tenant_tables t on t.relname = p.tablename
    where p.schemaname = 'public'
      and coalesce(p.qual, '') !~ 'tenant_id'
      and coalesce(p.with_check, '') !~ 'tenant_id'
      and not (p.tablename = 'user_roles' and p.policyname = 'user views own roles')
    union all
    select 'fk ' || ch.relname || '.' || c.conname
    from pg_constraint c
    join tenant_tables ch on ch.oid = c.conrelid
    join tenant_tables pa on pa.oid = c.confrelid
    join pg_attribute fa on fa.attrelid = c.confrelid and fa.attnum = c.confkey[1]
    where c.contype = 'f'
      and array_length(c.conkey, 1) = 1
      and fa.attname = 'id'
  )
  select string_agg(gap, ', ') into v_gaps from gaps;

  if v_gaps is not null then
    raise exception 'Tenant isolation gaps remain: %', v_gaps;
  end if;
end $$;
