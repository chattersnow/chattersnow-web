-- #1327 / #1328: the platform tenant's own public copy.
--
-- The platform tenant is the one tenant whose public site is the *product's*
-- marketing site, and the only one for which the two audience paths are
-- meant. Everything here is data rather than code, which is the whole reason
-- #1325 settled on building the site in this codebase: the words are
-- portal-editable from Administration -> Site Content and need no deploy.
-- This migration is the starting set, not a source of truth -- an editor's
-- later change wins and nothing here rewrites it.
--
-- ## Which tenant
--
-- Scoped by plan and by having a domain at all, rather than by slug. Slugs are
-- `service_role`-only and this deployment's platform slug is not written down
-- in the repository, so naming one here would be a guess that silently
-- no-ops. The bootstrap tenant that `20260905190000_seed_initial_tenant.sql`
-- creates -- `example-nonprofit` in local development and CI -- is also on the
-- `internal` plan and has **no** `custom_domain`, so the second condition is
-- what keeps local and CI out of this. `supabase/seed.sql` gives them their
-- own copy.
--
-- It matches at most one row by assumption, and the assumption is checked:
-- the platform tenant is the only `internal` tenant with a domain
-- (docs/tenants.md's host table). If a deployment ever has two, this raises
-- rather than writing the product's pitch onto whichever customer's site
-- sorted first. A loud stop on a violated premise beats a quiet
-- misattribution, and it is recoverable -- whoever hits it fixes the plan
-- column or names a slug here.
--
-- ## What is deliberately not here
--
-- The screenshots (#1332), and the audience pages' copy. That copy is the
-- registry default in `src/lib/site-content.ts`: those slots describe the
-- platform rather than an organization, so the platform can write them once
-- for every operator instead of seeding one tenant's rows with them. Only the
-- things a default genuinely cannot know are written below -- this
-- deployment's headline, and the host its demo lives on.
--
-- Triggers off, per 20260908000000 and 20260912050000: there is no session in
-- a migration, so `set_updated_at` would stamp a null actor and
-- `audit_log_row` would write actorless entries into the tenant's audit log.

do $$
declare
  v_tenant_id uuid;
  v_count int;
begin
  select count(*) into v_count
  from public.tenants
  where plan = 'internal' and custom_domain is not null;

  if v_count = 0 then
    raise notice
      '[#1327] no platform tenant with a custom_domain; skipping the marketing rows';
    return;
  end if;

  if v_count > 1 then
    raise exception
      '[#1327] % tenants are on the internal plan with a custom_domain; this migration cannot tell which one owns the product marketing site. Put the customer tenants on their real plan, or name the platform slug here.',
      v_count;
  end if;

  select id into v_tenant_id
  from public.tenants
  where plan = 'internal' and custom_domain is not null;

  alter table public.site_content
    disable trigger set_updated_at,
    disable trigger audit_log_row;

  -- `on conflict do nothing` throughout: a row the operator has already
  -- written from the portal is newer than anything here.
  insert into public.site_content (tenant_id, key, value, published_at)
  values
    (v_tenant_id, 'home.heading',
     '"One system for small organizations that outgrew spreadsheets"'::jsonb,
     now()),
    (v_tenant_id, 'home.intro',
     '"Finance, people, events, volunteers, programs, inventory and the paperwork, in one place instead of a spreadsheet, a shared drive, a donation form and a booking tool that none of them talk to."'::jsonb,
     now()),
    -- One button, not three. The three the registry defaults to are a
    -- *tenant's* home page -- an events listing, a volunteer page, a donation
    -- ask -- and none of them is what this site is for. The demo needs no
    -- signup and resets nightly, which makes it the strongest thing this page
    -- can offer a reader (#998).
    --
    -- The host is written here rather than in Core because it is exactly the
    -- kind of thing that moves: host -> tenant resolution is data-driven, so
    -- the eventual move to a product domain is this row and a `custom_domain`
    -- update rather than a code change.
    (v_tenant_id, 'home.ctas',
     '[{"label": "Try the demo", "href": "https://demo.rickiecruz.com", "shown": true}]'::jsonb,
     now()),
    (v_tenant_id, 'audience_nonprofits.ctas',
     '[{"label": "Try the demo", "href": "https://demo.rickiecruz.com", "shown": true}]'::jsonb,
     now()),
    (v_tenant_id, 'audience_business.ctas',
     '[{"label": "Try the demo", "href": "https://demo.rickiecruz.com", "shown": true}]'::jsonb,
     now())
  on conflict (tenant_id, key) do nothing;

  alter table public.site_content
    enable trigger set_updated_at,
    enable trigger audit_log_row;

  -- The two audience paths, on for this tenant and this tenant only (#1328).
  insert into public.app_settings (tenant_id, key, value)
  values (v_tenant_id, 'page_visibility.audiences', to_jsonb(true))
  on conflict (tenant_id, key) do nothing;
end $$;
