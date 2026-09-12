-- #911 (phase A): what an organization calls the six person roles.
--
-- Donor, sponsor, volunteer, attendee, staff and partner are nonprofit
-- vocabulary. An organization that sells things has customers, a studio has
-- members and students, a shop has clients and suppliers -- and none of that
-- could be expressed, so "Donors" sat in the People sidebar whether or not the
-- tenant fundraised.
--
-- The keys stay platform-owned. `is_donor` is derived by person_role_flags()
-- from the donation tables, is a column on people_with_roles, is what
-- /portal/donors filters on, and is one of the six person_role_tags.role is
-- check-constrained to. Every one of those is written against the key, so what
-- becomes tenant data is only the words a reader sees.
--
-- One setting rather than twelve: `people.role_labels` is a jsonb map of
-- aspect key -> { singular, plural }, whose shape is the registry in
-- src/lib/person-roles.ts. Two words per role because the plural is rarely the
-- singular plus an "s" once a tenant picks it (Staff Member/Staff), and both
-- appear at once -- a "New Donor" button above a page titled "Donors".
--
-- What phases B and C of the ticket will add, and this deliberately does not:
-- dropping a role a tenant has no module for (blocked on #900), and
-- tenant-defined tags beyond the six (its own ticket, once this lands).

-- The view the portal reads, for the same two reasons tenant_lexicon and
-- tenant_branding are definer views (#887): app_settings' select policy for
-- `authenticated` requires one of six `manage` permissions
-- (20260906040000_tenant_scope_app_settings_and_views.sql:30), and the audience
-- for these words is anyone holding people:view. A volunteer would otherwise
-- read a directory labelled in the platform's words while everyone else read
-- the organization's. Isolation is the tenant predicate below rather than RLS.
--
-- Not a public_ sibling: no public page names a person role. A tenant's word
-- for its donors is not a secret, but an unused anon-facing view is a widening
-- nobody is asking for, and public_lexicon is the precedent for adding one if
-- a public surface ever needs it.

create or replace view public.tenant_person_role_labels as
select value as labels
from public.app_settings
where key = 'people.role_labels'
  and tenant_id = public.current_tenant_id();

grant select on public.tenant_person_role_labels to authenticated;

-- SELECT and nothing else, as 20260912030000 explains: the hosted project still
-- auto-exposes a new entity in `public` with ALL privileges, and a definer view
-- over a simple body is auto-updatable -- which would be a write to any
-- tenant's app_settings with no RLS in the way. tenant_isolation_gaps() refuses
-- one; this line keeps this view from being the first finding. A no-op wherever
-- the grants were never made.
revoke insert, update, delete on public.tenant_person_role_labels
  from anon, authenticated;

comment on view public.tenant_person_role_labels is
  'The current tenant''s words for the six person roles, keyed by the registry in src/lib/person-roles.ts (#911). One row at most; an unset role, or no row at all, renders the platform''s own word. Security definer by design (#887): the audience is anyone holding people:view, and app_settings'' select policy requires one of six `manage` permissions. Isolation is tenant_id = current_tenant_id() over the single people.role_labels key.';

-- Provisioning copies the template tenant's `people.%` settings, so an operator
-- who has taught the template to say "Students" does not retype it per tenant.
-- Unchanged signature, so this is the same function with one predicate widened;
-- everything else is 20260912070000_tenant_owned_role_labels.sql verbatim --
-- including its role copy, which a body restated from any earlier migration
-- would silently undo. `create or replace` takes a whole body, so the newest
-- one is the only safe thing to start from.

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
