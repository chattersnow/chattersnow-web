-- Issue #910: tenant-owned role labels, retirable built-ins, and the last
-- role-name test out of SQL.
--
-- The five roles the platform seeds every tenant with (20260821080000) are
-- nonprofit vocabulary, written when Chatter Snow was the product. Any
-- organization can be provisioned now (#795), and a studio or a club still
-- gets an "Event coordinator" and a "Board" it can neither rename nor retire.
--
-- `roles.name` stays a platform-wide machine key on purpose: nineteen lines
-- across these migrations seed `role_permissions` with
-- `join public.roles r on r.name = '<role>'` across every tenant, which is
-- exactly what lets provisioning copy the current platform default matrix
-- without being updated each time a resource is added. A tenant that renamed
-- `event_coordinator` would be silently skipped by the next such migration.
-- So the key stays immutable and machine-owned, and the *display name*
-- becomes tenant-owned data.

-- 1. The label ---------------------------------------------------------------
--
-- Nullable, so an unset label keeps today's derived wording ("Event
-- coordinator" from `event_coordinator`) and any future change to the
-- platform's default wording still flows through. Display everywhere resolves
-- to `coalesce(label, formatRoleLabel(name))` -- see `roleDisplayName()` in
-- src/lib/format.ts. Deliberately not backfilled: writing "Event coordinator"
-- into every tenant's row now would freeze the derived wording as data.

alter table public.roles add column label text;

comment on column public.roles.label is
  'Tenant-owned display name for the role (#910). Null means "derive it from name". `name` is the platform key that migrations seed the permission matrix by, and is never a display string.';

-- 2. list_calendar_owners(): by permission, not by role name ------------------
--
-- Its definition in 20260906030000 filters `and r.name in ('admin',
-- 'event_coordinator')`, the last live role-name test in SQL. A tenant that
-- retires `event_coordinator` in favour of an equally-permissioned role of its
-- own would get an owner picker that silently omits those people.
-- list_event_leads() (20260827030000) solved this the right way: join
-- `role_permissions`/`resources` and test the permission. The caller gate
-- (`has_permission('content_calendar', 'view')`) and the tenant filter are
-- unchanged, and the result is the same on an untouched tenant -- `admin` and
-- `event_coordinator` are exactly the two roles seeded with
-- `content_calendar: manage` (20260824000000).

create or replace function public.list_calendar_owners()
returns table (person_id uuid, auth_user_id uuid, name text, preferred_name text, email text)
language sql
security definer
set search_path = public
stable
as $$
  select p.id, p.auth_user_id, p.name, p.preferred_name, p.email
  from public.people p
  where p.auth_user_id is not null
    and p.tenant_id = (select public.current_tenant_id())
    and public.has_permission('content_calendar', 'view')
    and exists (
      select 1
      from public.user_roles ur
      join public.role_permissions rp on rp.role_id = ur.role_id
      join public.resources res
        on res.id = rp.resource_id
       and res.key = 'content_calendar'
       and rp.level = 'manage'
      where ur.user_id = p.auth_user_id
        and ur.tenant_id = p.tenant_id
    )
  order by coalesce(p.preferred_name, p.name, p.email);
$$;

-- 3. Provisioning copies every role the template holds ------------------------
--
-- Restated whole because `create or replace` takes a whole body; the only
-- changes from 20260912020000 are the role copy and the label it now carries.
-- The five-by-name filter was right while Chatter Snow was the product and is
-- backwards now that the platform tenant is where defaults are curated: an
-- operator who adds a role to the template means it for new tenants, and one
-- they retired there is one a new tenant should not be given. `admin` stays
-- the hard requirement (checked below), because the staged grant and every
-- Administration screen depend on it.

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
  -- category vocabulary (20260904150000), the agenda templates
  -- (20260826050000) and the content brief templates (20260824105000).
  -- Copied whole from the template, current versions included, so a tenant
  -- starts with a working vocabulary rather than an empty picker. Everything
  -- else a migration seeded -- the observance calendar, the nonprofit-status
  -- milestones -- describes the template tenant itself and is not copied.
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

  insert into public.content_brief_templates (tenant_id, key, name, description, is_active, requires_consent)
  select v_tenant_id, t.key, t.name, t.description, t.is_active, t.requires_consent
  from public.content_brief_templates t
  where t.tenant_id = v_template_id;

  insert into public.content_brief_template_versions (tenant_id, template_id, version, fields)
  select v_tenant_id, nt.id, v.version, v.fields
  from public.content_brief_template_versions v
  join public.content_brief_templates ot on ot.id = v.template_id
  join public.content_brief_templates nt on nt.tenant_id = v_tenant_id and nt.key = ot.key
  where v.tenant_id = v_template_id;

  update public.content_brief_templates nt
  set current_version_id = nv.id
  from public.content_brief_templates ot
  join public.content_brief_template_versions ov on ov.id = ot.current_version_id
  join public.content_brief_template_versions nv
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
  -- time and the fiscal year. Not the template's images, page visibility,
  -- branding or site content -- those are the template tenant's own.
  insert into public.app_settings (tenant_id, key, value)
  select v_tenant_id, s.key, s.value
  from public.app_settings s
  where s.tenant_id = v_template_id
    and (s.key like 'finance.%' or s.key like 'content.%' or s.key like 'org.%');

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
  'Creates a tenant ready to sign into: every role the template tenant holds, with its labels and whole permission matrix (#910), the catalog defaults and platform settings copied from the template (the oldest internal tenant unless given), any content packs named in p_pack_keys copied in as drafts (#895), and a staged admin grant for p_admin_email. service_role only.';
