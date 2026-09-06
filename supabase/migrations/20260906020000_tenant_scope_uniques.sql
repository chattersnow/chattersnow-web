-- Multi-tenancy Phase 2 (#707): uniqueness that was global becomes per-tenant.
--
-- Twelve constraints and indexes said "unique across the whole database" when
-- they meant "unique within the organisation". Each becomes (tenant_id, ...)
-- under its existing name, keeping any partial predicate, so nothing that
-- names them -- `on conflict` targets, error-code mapping in the app -- has to
-- change.
--
-- Left alone on purpose: every unique that is already scoped by a foreign key
-- to a tenant table (event_id, meeting_id, giveaway_id, person_id, role_id,
-- program_id ...). Those are tenant-safe transitively, and several of them are
-- arbiter indexes for `on conflict` clauses in supabase/seed.sql
-- (board_members_one_active_per_person, access_grants_active_person_asset_key)
-- that would stop inferring if a column were added. The giveaway
-- (id, giveaway_id) uniques are composite-foreign-key targets
-- (20260904100000) and are likewise untouched.
--
-- people.auth_user_id joins the list: one auth account may be a person in more
-- than one tenant. The functions that looked people up by auth_user_id alone
-- are rewritten in 20260906050000 to look within the current tenant.
--
-- volunteer_applications.reference_code becomes per-tenant as #707 specifies;
-- generate_volunteer_reference_code() and lookup_volunteer_application_status()
-- are scoped to match in 20260906050000.

alter table public.app_settings
  drop constraint app_settings_key_key,
  add constraint app_settings_key_key unique (tenant_id, key);

alter table public.roles
  drop constraint roles_name_key,
  add constraint roles_name_key unique (tenant_id, name);

alter table public.programs
  drop constraint programs_name_key,
  add constraint programs_name_key unique (tenant_id, name);

alter table public.services
  drop constraint services_name_key,
  add constraint services_name_key unique (tenant_id, name);

alter table public.volunteer_role_types
  drop constraint volunteer_role_types_name_key,
  add constraint volunteer_role_types_name_key unique (tenant_id, name);

alter table public.content_brief_templates
  drop constraint content_brief_templates_key_key,
  add constraint content_brief_templates_key_key unique (tenant_id, key);

alter table public.agenda_templates
  drop constraint agenda_templates_key_key,
  add constraint agenda_templates_key_key unique (tenant_id, key);

alter table public.inventory_category_groups
  drop constraint inventory_category_groups_key_key,
  add constraint inventory_category_groups_key_key unique (tenant_id, key);

alter table public.inventory_categories
  drop constraint inventory_categories_key_key,
  add constraint inventory_categories_key_key unique (tenant_id, key);

alter table public.volunteer_applications
  drop constraint volunteer_applications_reference_code_key,
  add constraint volunteer_applications_reference_code_key unique (tenant_id, reference_code);

-- Standalone partial indexes (20260904190000, 20260823130000), so drop/create
-- rather than drop/add constraint. Same names, same predicates.
drop index public.people_email_key;
create unique index people_email_key
  on public.people (tenant_id, lower(email))
  where email is not null and not is_anonymous;

drop index public.people_auth_user_id_key;
create unique index people_auth_user_id_key
  on public.people (tenant_id, auth_user_id)
  where auth_user_id is not null;
