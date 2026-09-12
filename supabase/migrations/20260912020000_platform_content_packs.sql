-- #895: platform-authored content packs.
--
-- #894 made Learn a collection of rows a tenant owns. That leaves the platform
-- tenant as simply another author -- and the reusable thing lives there. A
-- **pack** is a named set of article categories (and the articles on them)
-- owned by a tenant on the `internal` plan, offered to other tenants at
-- provisioning or on demand from Administration.
--
-- ## Copy, not reference
--
-- A tenant that adopts a pack gets *its own rows*, which it then owns and
-- edits. The alternative -- rendering the platform's rows directly under a
-- tenant override layer -- means a platform edit silently rewrites a
-- nonprofit's published page, under that nonprofit's brand and byline, with no
-- review by anyone who works there. That is the failure mode #795 item 3
-- identified in the legal defaults and #858 fixed by making the platform's
-- document a *default* rather than the tenant's document; it is not
-- reintroduced here one surface over.
--
-- The consequence is real and accepted rather than designed around: **no
-- upstream updates**. A pack improved after adoption does not reach the tenants
-- that already took it. That is why `content_pack_adoptions` carries the pack's
-- key and name as text rather than a foreign key -- there is no live link to
-- model, only a record that a copy was taken.
--
-- ## Adopted as drafts
--
-- Copies land with `value` null and `draft_value` set, which is exactly the
-- shape #894 gave an article being written. Somebody at the organization reads
-- the words and presses Publish before they appear under its brand; adoption
-- does not put anything on a public site.
--
-- ## Deliberately not here
--
-- Pack versioning, upstream updates or diffs, and anything resembling a
-- marketplace. Also no seeded pack: `decisions/2026-09-05-portal-ip-ownership.md`
-- places "all public copy, program and Learn content" in Organization Material
-- owned by Chatter Snow, so the snow-sports guides stay Chatter Snow's and do
-- not become the first pack. This migration ships the mechanism with an empty
-- catalog.

-- 1. The pack ----------------------------------------------------------------

create table public.content_packs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) default public.default_tenant_id(),
  key text not null check (key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (btrim(name) <> ''),
  description text not null default '',
  -- A pack is not on offer until somebody says so. Authoring one is ordinary
  -- article editing in the platform tenant; offering it is the deliberate act.
  is_offered boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references auth.users(id),
  unique (tenant_id, key),
  -- The target of the composite foreign key below, and the reason it can be
  -- composite: a pack and the categories in it belong to the same tenant.
  unique (tenant_id, id)
);

comment on table public.content_packs is
  'A named set of article categories the platform tenant offers to other tenants (#895). Adoption copies rows; there is no live link back, which is why nothing references a pack across tenants.';
comment on column public.content_packs.is_offered is
  'Whether the pack appears in other tenants'' catalog. False while it is being written.';

create index content_packs_tenant_id_idx on public.content_packs (tenant_id);

create trigger set_updated_at before update on public.content_packs
  for each row execute function public.set_updated_at();

-- Membership. A category belongs to at most one pack, and the composite key
-- makes a category in another tenant's pack physically impossible.
-- `set null (pack_id)` names the column on purpose: the default form nulls
-- every column of the key, and `tenant_id` is one of them -- deleting a pack
-- would try to strip its categories of their tenant. Postgres 15 added the
-- column list for exactly this case.
alter table public.article_categories
  add column pack_id uuid,
  add constraint article_categories_pack_fkey
    foreign key (tenant_id, pack_id)
    references public.content_packs (tenant_id, id) on delete set null (pack_id);

create index article_categories_pack_id_idx on public.article_categories (pack_id);

comment on column public.article_categories.pack_id is
  'The pack this category is offered as part of (#895), or NULL. Only meaningful on the platform tenant: a copy taken by adoption belongs to nothing, because it is the adopting tenant''s own article from that moment on.';

-- 2. What a tenant took ------------------------------------------------------
--
-- A log rather than a link. `pack_id` is a plain uuid with no foreign key
-- precisely because the pack it names may be renamed, re-scoped or deleted
-- afterwards and none of that reaches the copy -- which is the whole point of
-- copying. The key and name are snapshotted for the same reason.

create table public.content_pack_adoptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) default public.default_tenant_id(),
  pack_id uuid not null,
  pack_key text not null,
  pack_name text not null,
  category_count integer not null default 0,
  article_count integer not null default 0,
  adopted_at timestamptz not null default now(),
  adopted_by uuid default auth.uid() references auth.users(id)
);

comment on table public.content_pack_adoptions is
  'A record that a tenant copied a pack (#895). Deliberately not a foreign key to content_packs: adoption is a copy, the copy has no upstream, and the pack may be gone by the time anybody reads this row.';

create index content_pack_adoptions_tenant_id_idx on public.content_pack_adoptions (tenant_id, adopted_at desc);

-- 3. RLS ---------------------------------------------------------------------
--
-- Both tables read within the tenant, gated on `site_content:view` -- the same
-- resource #894 chose for articles, for the same reason: packs are more of the
-- words on the public site, edited from the same screen by the same people.
-- Neither is writable by `authenticated` at all; the definer functions below
-- are the only writers, so "offered" and "adopted" cannot be set through
-- PostgREST.

alter table public.content_packs enable row level security;
alter table public.content_pack_adoptions enable row level security;

create policy "content_packs select" on public.content_packs for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('site_content', 'view')
  );

create policy "content_pack_adoptions select" on public.content_pack_adoptions for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('site_content', 'view')
  );

revoke all on public.content_packs from anon, authenticated;
revoke all on public.content_pack_adoptions from anon, authenticated;
grant select on public.content_packs to authenticated;
grant select on public.content_pack_adoptions to authenticated;

-- 4. The catalog -------------------------------------------------------------
--
-- A function rather than a view, because this is the one read that deliberately
-- crosses tenants: a nonprofit sees what the *platform* is offering. The
-- crossing is narrow and one-directional -- offered packs on an `internal`
-- tenant, names and counts only, never a body -- and the counts are of
-- published rows, so a pack half-written in the platform tenant advertises only
-- what an adopter would actually receive.

create or replace function public.available_content_packs()
returns table (
  id uuid,
  key text,
  name text,
  description text,
  category_count integer,
  article_count integer,
  adopted_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select p.id, p.key, p.name, p.description,
    (select count(*)::integer
     from public.article_categories c
     where c.pack_id = p.id and c.value is not null),
    (select count(*)::integer
     from public.articles a
     join public.article_categories c on c.id = a.category_id
     where c.pack_id = p.id and c.value is not null and a.value is not null),
    (select max(ad.adopted_at)
     from public.content_pack_adoptions ad
     where ad.tenant_id = (select public.current_tenant_id())
       and ad.pack_id = p.id)
  from public.content_packs p
  join public.tenants t on t.id = p.tenant_id and t.plan = 'internal'
  where public.has_permission('site_content', 'view')
    and p.is_offered
    and p.tenant_id is distinct from (select public.current_tenant_id())
  order by p.name;
$$;

comment on function public.available_content_packs() is
  'The packs this tenant may adopt (#895): offered packs authored by a tenant on the internal plan, with the count of *published* categories and articles an adopter would receive, and when this tenant last took it.';

revoke execute on function public.available_content_packs() from public;
grant execute on function public.available_content_packs() to authenticated;

-- 5. The copy ----------------------------------------------------------------
--
-- One implementation, two callers: adoption from Administration and the pack
-- list `provision_tenant()` is given. It takes a tenant id, so it is never
-- granted to `authenticated` -- both callers establish who is asking first and
-- then name the tenant themselves.

create or replace function public.copy_content_pack(p_pack_id uuid, p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_key text;
  v_name text;
  v_taken text;
  v_base integer;
  v_categories integer := 0;
  v_articles integer := 0;
begin
  select p.tenant_id, p.key, p.name into v_owner, v_key, v_name
  from public.content_packs p
  join public.tenants t on t.id = p.tenant_id and t.plan = 'internal'
  where p.id = p_pack_id and p.is_offered;

  if v_owner is null then
    raise exception 'NO_PACK';
  end if;
  if v_owner = p_tenant_id then
    raise exception 'OWN_PACK';
  end if;

  -- A category's slug is its address, and #894 keeps an address out of the
  -- draft on purpose. So a pack whose slug the tenant already uses cannot be
  -- adopted silently under a different address, and must not overwrite what is
  -- there: the whole adoption is refused and the addresses are named, which is
  -- also what stops a second adoption of the same pack duplicating it.
  select string_agg(c.slug, ', ' order by c.slug) into v_taken
  from public.article_categories c
  where c.tenant_id = v_owner
    and c.pack_id = p_pack_id
    and c.value is not null
    and exists (
      select 1 from public.article_categories existing
      where existing.tenant_id = p_tenant_id and existing.slug = c.slug
    );
  if v_taken is not null then
    raise exception 'SLUG_TAKEN: %', v_taken;
  end if;

  select coalesce(max(position), -1) + 1 into v_base
  from public.article_categories where tenant_id = p_tenant_id;

  -- Published rows only, and they arrive as drafts: `value` stays null and the
  -- words go in `draft_value`. Nothing here reaches a public site.
  insert into public.article_categories (tenant_id, slug, position, draft_value, has_draft)
  select p_tenant_id, source.slug, v_base + source.ordinal, source.value, true
  from (
    select c.slug, c.value,
           (row_number() over (order by c.position, c.slug) - 1)::integer as ordinal
    from public.article_categories c
    where c.tenant_id = v_owner and c.pack_id = p_pack_id and c.value is not null
  ) as source;
  get diagnostics v_categories = row_count;

  -- The new categories are found by slug, which is unique per tenant and, by
  -- the check above, matches nothing the tenant had before this statement.
  insert into public.articles (tenant_id, category_id, anchor, position, draft_position, draft_value, has_draft)
  select p_tenant_id, nc.id, source.anchor, 0, source.ordinal, source.value, true
  from (
    select oc.slug, a.anchor, a.value,
           (row_number() over (partition by a.category_id order by a.position, a.anchor) - 1)::integer as ordinal
    from public.articles a
    join public.article_categories oc on oc.id = a.category_id
    where a.tenant_id = v_owner
      and oc.pack_id = p_pack_id
      and oc.value is not null
      and a.value is not null
  ) as source
  join public.article_categories nc
    on nc.tenant_id = p_tenant_id and nc.slug = source.slug;
  get diagnostics v_articles = row_count;

  insert into public.content_pack_adoptions
    (tenant_id, pack_id, pack_key, pack_name, category_count, article_count)
  values (p_tenant_id, p_pack_id, v_key, v_name, v_categories, v_articles);

  return jsonb_build_object(
    'pack_key', v_key,
    'pack_name', v_name,
    'categories', v_categories,
    'articles', v_articles
  );
end;
$$;

comment on function public.copy_content_pack(uuid, uuid) is
  'Copies an offered pack''s published categories and articles into a tenant as drafts (#895). Owner-only: it names a tenant rather than deriving one, so its two callers -- adopt_content_pack() and provision_tenant() -- are where authorization happens.';

revoke execute on function public.copy_content_pack(uuid, uuid) from public;

-- 6. Adoption ----------------------------------------------------------------

create or replace function public.adopt_content_pack(p_pack_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
begin
  if v_tenant is null then
    raise exception 'NO_TENANT';
  end if;
  if not public.has_permission('site_content', 'manage') then
    raise exception 'FORBIDDEN';
  end if;

  return public.copy_content_pack(p_pack_id, v_tenant);
end;
$$;

comment on function public.adopt_content_pack(uuid) is
  'Copies a pack into the calling tenant as drafts (#895). Requires site_content:manage -- the permission that already decides who may put words on the public site, which is what publishing the copies will do.';

revoke execute on function public.adopt_content_pack(uuid) from public;
grant execute on function public.adopt_content_pack(uuid) to authenticated;

-- 7. Authoring a pack --------------------------------------------------------
--
-- Platform-operator only, all three conditions, via require_platform_operator()
-- (#795 item 1): a pack authored anywhere else would never appear in a catalog
-- -- available_content_packs() requires an `internal` owner -- so allowing one
-- would only create rows nobody can reach.

create or replace function public.save_content_pack(
  p_id uuid,
  p_key text,
  p_name text,
  p_description text default '',
  p_is_offered boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_id uuid := p_id;
begin
  perform public.require_platform_operator();

  if v_id is null then
    insert into public.content_packs (tenant_id, key, name, description, is_offered)
    values (v_tenant, lower(btrim(p_key)), btrim(p_name), coalesce(p_description, ''), coalesce(p_is_offered, false))
    returning id into v_id;
  else
    update public.content_packs
    set key = lower(btrim(p_key)),
        name = btrim(p_name),
        description = coalesce(p_description, ''),
        is_offered = coalesce(p_is_offered, false),
        updated_by = auth.uid()
    where tenant_id = v_tenant and id = v_id;
    if not found then
      raise exception 'NO_PACK';
    end if;
  end if;

  return v_id;
end;
$$;

revoke execute on function public.save_content_pack(uuid, text, text, text, boolean) from public;
grant execute on function public.save_content_pack(uuid, text, text, text, boolean) to authenticated;

create or replace function public.delete_content_pack(p_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_count integer;
begin
  perform public.require_platform_operator();

  -- The categories stay; only their membership goes (`on delete set null`).
  -- A pack is a label on the platform's own articles, and deleting the label
  -- is not a reason to delete the writing.
  delete from public.content_packs where tenant_id = v_tenant and id = p_id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.delete_content_pack(uuid) is
  'Removes a pack (#895). Its categories survive and simply stop belonging to it; tenants that already adopted it keep their copies, which never referenced it.';

revoke execute on function public.delete_content_pack(uuid) from public;
grant execute on function public.delete_content_pack(uuid) to authenticated;

create or replace function public.set_article_category_pack(
  p_category_id uuid,
  p_pack_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_count integer;
begin
  perform public.require_platform_operator();

  if p_pack_id is not null and not exists (
    select 1 from public.content_packs
    where tenant_id = v_tenant and id = p_pack_id
  ) then
    raise exception 'NO_PACK';
  end if;

  update public.article_categories
  set pack_id = p_pack_id
  where tenant_id = v_tenant and id = p_category_id;
  get diagnostics v_count = row_count;

  if v_count = 0 then
    raise exception 'NO_CATEGORY';
  end if;
  return v_count;
end;
$$;

revoke execute on function public.set_article_category_pack(uuid, uuid) from public;
grant execute on function public.set_article_category_pack(uuid, uuid) to authenticated;

-- 8. Provisioning offers packs -----------------------------------------------
--
-- The same seam the permission matrix and the catalog defaults already use: a
-- new tenant is built from the template tenant, and packs are one more thing
-- the template has. Keys rather than ids, because the operator's form and the
-- CLI both name a pack by what it is called, and a key is stable where an id in
-- a script is not.
--
-- Unknown keys are refused rather than skipped. Provisioning is a one-shot
-- operation an operator watches once, and "nothing happened" is the worst
-- possible answer to a typo in a pack name.

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

  -- Roles: the five the platform seeds (20260821080000), by name from the
  -- template. A tenant that renamed or dropped one changes what it copies;
  -- the admin role is the one that is required (checked above), because the
  -- staged grant below and every administration screen depend on it.
  insert into public.roles (tenant_id, name, description)
  select v_tenant_id, r.name, r.description
  from public.roles r
  where r.tenant_id = v_template_id
    and r.name in ('admin', 'event_coordinator', 'finance', 'board', 'volunteer');

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

-- The six-argument signature is gone: `create or replace` cannot change an
-- argument list, so the old function is a separate overload and every call
-- naming five or six arguments would become ambiguous. Dropping it is safe
-- because every caller uses named arguments and the new parameter defaults.
-- Grants do not follow a new signature, so they are restated.
comment on function public.provision_tenant(text, text, text, text, text, uuid, text[]) is
  'Creates a tenant ready to sign into: seeded roles and permission matrix, catalog defaults and platform settings copied from the template tenant (the oldest internal tenant unless given), any content packs named in p_pack_keys copied in as drafts (#895), and a staged admin grant for p_admin_email. service_role only.';

drop function if exists public.provision_tenant(text, text, text, text, text, uuid);

revoke execute on function public.provision_tenant(text, text, text, text, text, uuid, text[]) from public;
grant execute on function public.provision_tenant(text, text, text, text, text, uuid, text[]) to service_role;

create or replace function public.platform_provision_tenant(
  p_name text,
  p_slug text,
  p_custom_domain text default null,
  p_plan text default 'white_label',
  p_admin_email text default null,
  p_pack_keys text[] default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_platform_operator();

  -- No p_template_tenant_id: provision_tenant() defaults to the oldest
  -- internal tenant, which is the platform default matrix by construction.
  -- Choosing a template is choosing which organization's permission matrix a
  -- customer inherits, and that is not a dropdown. The packs are, because a
  -- pack is content the operator is deliberately handing over.
  return public.provision_tenant(
    p_name => p_name,
    p_slug => p_slug,
    p_custom_domain => nullif(lower(btrim(coalesce(p_custom_domain, ''))), ''),
    p_plan => p_plan,
    p_admin_email => nullif(btrim(coalesce(p_admin_email, '')), ''),
    p_template_tenant_id => null,
    p_pack_keys => p_pack_keys
  );
end;
$$;

drop function if exists public.platform_provision_tenant(text, text, text, text, text);

grant execute on function public.platform_provision_tenant(text, text, text, text, text, text[]) to authenticated;

-- 9. Audit -------------------------------------------------------------------
--
-- Who offered a pack and who took one are both worth keeping: the first
-- decides what other organizations are shown, the second is how a nonprofit's
-- Learn section came to hold words nobody there wrote.

insert into public.audited_tables (table_name) values
  ('content_packs'), ('content_pack_adoptions');

create trigger audit_log_row after insert or update or delete on public.content_packs
  for each row execute function public.audit_log_row();
create trigger audit_log_row after insert or update or delete on public.content_pack_adoptions
  for each row execute function public.audit_log_row();

-- 10. Self-checks -------------------------------------------------------------

do $$
declare
  v_gaps text;
begin
  select string_agg(p.tablename || '.' || p.policyname, ', ') into v_gaps
  from pg_policies p
  where p.schemaname = 'public'
    and p.tablename in ('content_packs', 'content_pack_adoptions')
    and coalesce(p.qual, '') !~ 'tenant_id'
    and coalesce(p.with_check, '') !~ 'tenant_id';
  if v_gaps is not null then
    raise exception 'content pack policies without a tenant predicate: %', v_gaps;
  end if;
end $$;

-- The same grant check #894 makes over the article tables. If either of these
-- becomes writable by `authenticated`, a tenant can offer itself a pack or
-- forge an adoption record.
do $$
declare
  v_columns text;
begin
  select string_agg(distinct table_name || '.' || column_name, ', ') into v_columns
  from information_schema.column_privileges
  where table_schema = 'public'
    and table_name in ('content_packs', 'content_pack_adoptions')
    and grantee = 'authenticated'
    and privilege_type in ('INSERT', 'UPDATE');
  if v_columns is not null then
    raise exception 'content packs are directly writable by authenticated (%); offering and adoption can be forged', v_columns;
  end if;
end $$;

-- copy_content_pack() names its target tenant rather than deriving it, so a
-- grant to `authenticated` would let any signed-in editor write rows into any
-- tenant on the platform. Nothing but its two callers may hold it.
do $$
begin
  if has_function_privilege('authenticated', 'public.copy_content_pack(uuid, uuid)', 'EXECUTE') then
    raise exception 'copy_content_pack is executable by authenticated; it writes into a tenant it is told, not one it derives';
  end if;
end $$;
