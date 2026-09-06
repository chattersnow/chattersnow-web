-- Multi-tenancy Phase 2 (#707): tenant_id on every tenant-scoped table.
--
-- 73 tables gain `tenant_id uuid not null references public.tenants(id)
-- default public.default_tenant_id()`, backfilled to the one tenant that
-- 20260905190000 created. This is the cheapest this migration will ever be:
-- with exactly one tenant the backfill is a constant, so the preflight below
-- refuses to run against anything else rather than guess.
--
-- The tables that do NOT get a tenant_id, and why:
--
--   tenants, tenant_memberships, user_tenant_selection
--     The tenancy model itself (20260905180000).
--   resources
--     The permission catalog. Its keys are string literals in ~320 policies,
--     so it is platform code, not tenant data. role_permissions -- which
--     level each *tenant's* roles get on each resource -- is per-tenant.
--   audited_tables, retention_purgeable_person_refs
--     Schema registries read by triggers and the retention job.
--   rate_limit_hits
--     Per-IP velocity for the public forms. Abuse does not reset per tenant.
--   deactivated_users, user_onboarding
--     One row per auth account. Deactivation is the platform-wide kill switch
--     has_permission() consults (20260824230000); removing someone from one
--     tenant is a membership/role change, not a deactivation.
--   retention_policies, retention_runs, retention_run_tables
--     The retention purge (20260905120000) is one nightly platform sweep run
--     by pg_cron with no session. Per-tenant retention policies are a
--     provisioning concern for Phase 4; until then the job and its log stay
--     global by design.
--   audit_log
--     Gets a *nullable* tenant_id with no foreign key, below. Audit rows must
--     outlive the tenant they describe (the same reasoning person_merges gives
--     in 20260904180000), and rows from the global tables above legitimately
--     have no tenant. audit_log_row() stamps it from the audited row rather
--     than from the session, so it is right under anon and cron too
--     (20260906050000).
--
-- Three mechanics worth spelling out:
--
-- - The column is added WITHOUT a default and backfilled explicitly, then
--   set not null, then given its default. Relying on `add column ... default`
--   to fill existing rows would bake whatever default_tenant_id() returned at
--   migration time into the catalog, which is the kind of thing that is
--   correct today and inexplicable in a year.
-- - User triggers are disabled around each backfill update. Otherwise
--   set_updated_at would bump updated_at and null out updated_by (auth.uid()
--   is null in a migration) on every row of 60 tables, and audit_log_row
--   would write one actor-less audit row per backfilled row -- about as many
--   as the table already holds. `disable trigger user` leaves the foreign
--   key triggers on. session_replication_role is not used because it would
--   disable those too, and needs a privilege the hosted role does not have.
-- - user_roles, role_permissions and pending_role_grants are backfilled from
--   the role they reference and get the set_tenant_id_from_role trigger
--   (20260906000000) instead of a default. See that migration for why.
--
-- Every tenant table also gets a plain (tenant_id) index. #707 asked for
-- tenant_id as the leading column on every existing index instead; that was
-- rejected because a (tenant_id, person_id) btree cannot serve `person_id =
-- $1`, which is exactly what the existing single-column indexes exist for --
-- referential-integrity checks on delete, and merge_people()'s repoint loop.
-- Phase 3's `tenant_id = ...` predicate combines fine with them, and a
-- dedicated tenant_id index is what the foreign key to tenants wants anyway.
--
-- Foreign keys to tenants are `no action` on purpose. Deleting a tenant that
-- still owns data is a platform operation with an export step in front of it
-- (Phase 4); the database refusing it is the right default.

do $$
declare
  v_tenant_id uuid;
  v_tenant_count integer;
  v_table text;
  v_tables text[] := array[
    'access_grants', 'agenda_template_versions', 'agenda_templates', 'agendas',
    'annual_requirements', 'app_settings', 'assets', 'board_members', 'bylaws',
    'calendar_item_categories', 'calendar_item_links', 'calendar_item_programs',
    'calendar_items', 'calendar_program_suggestion_rules',
    'conflict_of_interest_disclosures', 'contact_messages',
    'content_brief_template_versions', 'content_brief_templates',
    'content_opportunities', 'content_permissions', 'discount_codes', 'donations',
    'event_checklist_items', 'event_expenses', 'event_impact_notes',
    'event_incidents', 'event_logistics', 'event_programs', 'event_registrations',
    'event_revenue', 'event_shifts', 'event_sponsors', 'event_staff',
    'event_volunteers', 'events', 'giveaway_buckets', 'giveaway_prizes',
    'giveaway_ticket_grants', 'giveaway_ticket_packages', 'giveaway_ticket_sales',
    'giveaway_tier_grants', 'giveaway_tier_rules', 'giveaway_tiers',
    'giveaway_winners', 'giveaways', 'governance_meeting_action_items',
    'governance_meeting_attendees', 'governance_meeting_decisions',
    'governance_meetings', 'grants', 'inventory_categories',
    'inventory_category_groups', 'inventory_items', 'inventory_movements',
    'monetary_donations', 'nonprofit_status_milestones',
    'partnership_opportunities', 'people', 'person_merges', 'person_organizations',
    'person_role_tags', 'policies', 'programs', 'reimbursements', 'resolutions',
    'roles', 'services', 'volunteer_applications', 'volunteer_hours',
    'volunteer_role_types'
  ];
  -- Backfilled from their role, not from the tenant; see the header.
  v_role_tables text[] := array['user_roles', 'role_permissions', 'pending_role_grants'];
begin
  select count(*) into v_tenant_count from public.tenants;
  if v_tenant_count <> 1 then
    raise exception
      'Phase 2 backfill needs exactly one tenant to assign existing rows to, found %',
      v_tenant_count;
  end if;
  select id into v_tenant_id from public.tenants;

  foreach v_table in array v_tables loop
    execute format(
      'alter table public.%I add column tenant_id uuid references public.tenants(id)',
      v_table
    );
    execute format('alter table public.%I disable trigger user', v_table);
    execute format('update public.%I set tenant_id = $1', v_table) using v_tenant_id;
    execute format('alter table public.%I enable trigger user', v_table);
    execute format('alter table public.%I alter column tenant_id set not null', v_table);
    execute format(
      'alter table public.%I alter column tenant_id set default public.default_tenant_id()',
      v_table
    );
    execute format(
      'create index %I on public.%I (tenant_id)',
      v_table || '_tenant_id_idx', v_table
    );
  end loop;

  foreach v_table in array v_role_tables loop
    execute format(
      'alter table public.%I add column tenant_id uuid references public.tenants(id)',
      v_table
    );
    execute format('alter table public.%I disable trigger user', v_table);
    execute format(
      'update public.%I t set tenant_id = r.tenant_id from public.roles r where r.id = t.role_id',
      v_table
    );
    execute format('alter table public.%I enable trigger user', v_table);
    execute format('alter table public.%I alter column tenant_id set not null', v_table);
    execute format(
      'create trigger set_tenant_id_from_role before insert or update of role_id on public.%I
         for each row execute function public.set_tenant_id_from_role()',
      v_table
    );
    execute format(
      'create index %I on public.%I (tenant_id)',
      v_table || '_tenant_id_idx', v_table
    );
  end loop;

  -- audit_log: nullable, no foreign key, and only the rows that describe a
  -- tenant table are backfilled. The audit_log triggers are the ones being
  -- avoided elsewhere, and audit_log has none of its own, so no disable here.
  alter table public.audit_log add column tenant_id uuid;
  update public.audit_log
     set tenant_id = v_tenant_id
   where table_name = any (v_tables || v_role_tables);
  create index audit_log_tenant_occurred_idx on public.audit_log (tenant_id, occurred_at desc);

  raise notice 'tenant_id backfilled to tenant % on % tables', v_tenant_id,
    array_length(v_tables, 1) + array_length(v_role_tables, 1);
end $$;

comment on column public.roles.tenant_id is
  'Roles are per-tenant. user_roles, role_permissions and pending_role_grants take their tenant_id from the role by trigger (set_tenant_id_from_role), so seed inserts joined on roles.name stay correct on any number of tenants.';

comment on column public.audit_log.tenant_id is
  'Tenant of the audited row, stamped by audit_log_row() from the row itself. Null for the global tables (deactivated_users, retention_policies, tenants, ...). Deliberately not a foreign key: audit rows outlive their tenant.';
