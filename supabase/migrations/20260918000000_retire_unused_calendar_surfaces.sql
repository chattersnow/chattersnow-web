-- Retires the content-calendar surfaces that were built to the full spec ahead
-- of the product knowledge needed to operate them and have no current use:
-- the work queue, brief templates, program-suggestion rules, the annual review
-- report, related-item links and consent records (#1230).
--
-- Deleted rather than flagged: module entitlements (#900) gate whole modules,
-- and `calendar` is one module, so gating four sub-features would mean a second
-- gating layer over code nobody runs. This migration is the design document for
-- bringing any of it back.
--
-- What stays: month/list/agenda views, item CRUD, categories, priority tiers,
-- the plan/skip/defer decision, the recurring-coverage reminder + auto-generate
-- + CSV import, the public Community Calendar, audit history on calendar_items,
-- and a content brief per item. `calendar_items.is_sensitive_topic` and
-- `tone_guidance` stay as informational fields surfaced on the brief; only the
-- reviewer sign-off gate goes.

-- The annual review report and its resource. The RPC is dropped before the
-- tables it reads.
drop function if exists public.get_calendar_annual_review_data(date, date);

delete from public.role_permissions
where resource_id in (select id from public.resources where key = 'content_calendar_reports');

delete from public.resources where key = 'content_calendar_reports';

-- The consent record is audited; the registry row has to go with the table or
-- audit_log_row() keeps trying to stamp a table that no longer exists.
delete from public.audited_tables where table_name = 'content_permissions';

drop table if exists public.content_permissions;
drop table if exists public.content_brief_template_versions cascade;
drop table if exists public.content_brief_templates cascade;
drop table if exists public.calendar_program_suggestion_rules;
drop table if exists public.calendar_item_links;

-- The brief's template pin and its answers go with the templates.
alter table public.content_opportunities
  drop column if exists template_id,
  drop column if exists template_version_id,
  drop column if exists template_field_values;

-- The sign-off gate. is_sensitive_topic and tone_guidance stay.
alter table public.calendar_items
  drop column if exists sensitive_review_by,
  drop column if exists sensitive_review_at;

update public.modules
set description = 'The content calendar, its categories and its content briefs.'
where key = 'calendar';

-- Provisioning copied the template tenant's brief templates and their versions
-- into every new tenant. Those tables are gone, so the copy blocks go with
-- them; `db:reset` would otherwise fail loudly on the next provisioning.
create or replace function public.provision_tenant(
  p_name text,
  p_slug text,
  p_custom_domain text default null,
  p_plan text default 'white_label',
  p_admin_email text default null,
  p_template_tenant_id uuid default null,
  p_pack_keys text[] default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_template_id uuid;
  v_admin_role_id uuid;
  v_pack_id uuid;
  v_key text;
begin
  if nullif(btrim(coalesce(p_name, '')), '') is null then
    raise exception 'TENANT_NAME_REQUIRED';
  end if;

  v_template_id := coalesce(
    p_template_tenant_id,
    (select t.id from public.tenants t where t.plan = 'internal' order by t.created_at limit 1)
  );
  if v_template_id is null then
    raise exception 'TEMPLATE_TENANT_NOT_FOUND';
  end if;
  if not exists (
    select 1 from public.roles r where r.tenant_id = v_template_id and r.name = 'admin'
  ) then
    raise exception 'TEMPLATE_TENANT_HAS_NO_ADMIN_ROLE';
  end if;

  -- The slug and domain checks on the table do the validating; this only
  -- normalises what they will see.
  insert into public.tenants (name, slug, custom_domain, plan, status)
  values (
    btrim(p_name),
    lower(btrim(p_slug)),
    nullif(lower(btrim(coalesce(p_custom_domain, ''))), ''),
    p_plan,
    'active'
  )
  returning id into v_tenant_id;

  -- Roles: every role the template holds, labels included (#910).
  insert into public.roles (tenant_id, name, label, description)
  select v_tenant_id, r.name, r.label, r.description
  from public.roles r
  where r.tenant_id = v_template_id;

  -- The matrix for those roles. set_tenant_id_from_role stamps tenant_id.
  insert into public.role_permissions (role_id, resource_id, level)
  select nr.id, rp.resource_id, rp.level
  from public.role_permissions rp
  join public.roles tr on tr.id = rp.role_id and tr.tenant_id = v_template_id
  join public.roles nr on nr.tenant_id = v_tenant_id and nr.name = tr.name;

  -- The entitlements for the plan this tenant was sold (#900). The matrix
  -- above says what each role may reach; this says what the organization
  -- bought. Both are needed and they answer different questions.
  insert into public.tenant_modules (tenant_id, module_key, enabled)
  select v_tenant_id, pm.module_key, pm.enabled
  from public.plan_modules pm
  where pm.plan = p_plan;

  -- Catalog defaults that migrations give a fresh database: the inventory
  -- category vocabulary (20260904150000) and the agenda templates
  -- (20260826050000). Copied whole from the template, current versions
  -- included, so a tenant starts with a working vocabulary rather than an
  -- empty picker. Everything else a migration seeded -- the observance
  -- calendar, the nonprofit-status milestones -- describes the template
  -- tenant itself and is not copied. Brief templates were copied here too
  -- until #1230 retired them.
  insert into public.inventory_category_groups (tenant_id, key, label, sort_order, is_active)
  select v_tenant_id, g.key, g.label, g.sort_order, g.is_active
  from public.inventory_category_groups g
  where g.tenant_id = v_template_id;

  insert into public.inventory_categories (tenant_id, group_id, key, label, sort_order, is_active)
  select v_tenant_id, ng.id, c.key, c.label, c.sort_order, c.is_active
  from public.inventory_categories c
  join public.inventory_category_groups og on og.id = c.group_id
  join public.inventory_category_groups ng on ng.tenant_id = v_tenant_id and ng.key = og.key
  where c.tenant_id = v_template_id;

  insert into public.agenda_templates (tenant_id, key, name, description, is_active)
  select v_tenant_id, t.key, t.name, t.description, t.is_active
  from public.agenda_templates t
  where t.tenant_id = v_template_id;

  insert into public.agenda_template_versions (tenant_id, template_id, version, sections)
  select v_tenant_id, nt.id, v.version, v.sections
  from public.agenda_template_versions v
  join public.agenda_templates ot on ot.id = v.template_id
  join public.agenda_templates nt on nt.tenant_id = v_tenant_id and nt.key = ot.key
  where v.tenant_id = v_template_id;

  update public.agenda_templates nt
  set current_version_id = nv.id
  from public.agenda_templates ot
  join public.agenda_template_versions ov on ov.id = ot.current_version_id
  join public.agenda_template_versions nv
    on nv.tenant_id = v_tenant_id and nv.version = ov.version
  where nt.tenant_id = v_tenant_id
    and ot.tenant_id = v_template_id
    and nt.key = ot.key
    and nv.template_id = nt.id;

  -- The calendar category vocabulary (#834). Copied for the same reason as the
  -- inventory categories above: a tenant with an empty vocabulary cannot tag a
  -- calendar item at all, and the keys are what the views and the app join on.
  -- The labels come from the template, so what the template calls its own
  -- events is what a new tenant starts with -- and the platform tenant calls
  -- them "Our events", not "Chatter events".
  insert into public.calendar_categories (tenant_id, key, label, sort_order, is_active)
  select v_tenant_id, c.key, c.label, c.sort_order, c.is_active
  from public.calendar_categories c
  where c.tenant_id = v_template_id;

  -- Platform-default settings: the approval thresholds, the content lead
  -- time, the fiscal year, and what the template calls the six person roles
  -- (#911). Not the template's images, page visibility, branding or site
  -- content -- those are the template tenant's own.
  --
  -- `people.%` is here rather than left out with branding because the template
  -- tenant is where the platform's starter vocabulary is curated: an operator
  -- who provisions studios and has taught the template to say "Students"
  -- should not have to retype it for each one. A template that has set nothing
  -- copies nothing, which is what every environment does today.
  insert into public.app_settings (tenant_id, key, value)
  select v_tenant_id, s.key, s.value
  from public.app_settings s
  where s.tenant_id = v_template_id
    and (s.key like 'finance.%' or s.key like 'content.%' or s.key like 'org.%'
         or s.key like 'people.%');

  -- The content packs the operator chose (#895). Copies, as drafts, from the
  -- template tenant's offered packs -- so a new organization starts with
  -- material waiting to be read and published rather than with a live page it
  -- has never seen.
  if p_pack_keys is not null then
    foreach v_key in array p_pack_keys loop
      if nullif(btrim(v_key), '') is not null then
        select p.id into v_pack_id
        from public.content_packs p
        where p.tenant_id = v_template_id and p.key = lower(btrim(v_key)) and p.is_offered;
        if v_pack_id is null then
          raise exception 'NO_PACK: %', v_key;
        end if;
        perform public.copy_content_pack(v_pack_id, v_tenant_id);
      end if;
    end loop;
  end if;

  -- The first admin: a staged grant claim_pending_role_grants() turns into
  -- the admin role -- and, through ensure_membership_for_role, the
  -- membership -- the first time that address signs in. The operator script
  -- mints the invite link.
  if nullif(btrim(coalesce(p_admin_email, '')), '') is not null then
    select r.id into v_admin_role_id
    from public.roles r
    where r.tenant_id = v_tenant_id and r.name = 'admin';

    insert into public.pending_role_grants (email, role_id)
    values (lower(btrim(p_admin_email)), v_admin_role_id);
  end if;

  return v_tenant_id;
end;
$$;

comment on function public.provision_tenant(text, text, text, text, text, uuid, text[]) is
  'Creates a tenant ready to sign into: every role the template tenant holds, with its labels and whole permission matrix (#910), the catalog defaults and platform settings copied from the template (the oldest internal tenant unless given) -- including what it calls the six person roles (#911) -- any content packs named in p_pack_keys copied in as drafts (#895), and a staged admin grant for p_admin_email. service_role only.';

-- Restated for the same reason the original definition states them: the hosted
-- database's default privileges grant EXECUTE on every newly created function
-- in `public` to anon and authenticated, so a `create or replace` re-opens it.
revoke execute on function public.provision_tenant(text, text, text, text, text, uuid, text[]) from public, anon, authenticated;
grant execute on function public.provision_tenant(text, text, text, text, text, uuid, text[]) to service_role;
