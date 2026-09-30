-- The platform tenant's price list, re-cut from plans sized by logins to plans
-- sized by modules.
--
-- 20260920030000 seeded three plans that differed only by how many people
-- could log in ($29 for 3, $69 for 10, $129 unlimited), every module on every
-- plan. On 2026-09-29 the owner chose the other shape, recorded in the planning
-- repository at `coven/platform/2026-09-29-pricing-and-tiers.md`:
--
--   * Starter, $29 -- People and the website (Core), Events, Volunteers,
--     Programs, Messages.
--   * Operations, $79 -- adds Finance, Reimbursements, Inventory, the content
--     calendar and Artwork.
--   * Complete, $149 -- adds Governance (nonprofits), Conduct, Technology and
--     Constituent Accounts.
--
-- Logins are unlimited on every plan. The platform's costs do not grow with
-- them, and competitors that charge per seat or per contact are the ones a
-- volunteer-run organization outgrows first. The registry's default copy
-- (`src/lib/site-content.ts`) now describes the same shape with no figures in
-- it; this migration writes this deployment's figures.
--
-- ## The page stays hidden
--
-- `page_visibility.pricing` is not touched. These numbers are a proposal until
-- the owner publishes the page from Administration.
--
-- ## An edited row is left alone
--
-- `pricing.plans` is replaced only while it still holds exactly what
-- 20260920030000 wrote. If anybody has since typed their own plans into Site
-- Content, theirs is newer than this and the migration says so and moves on.
-- `pricing.intro` is inserted `on conflict do nothing` for the same reason.
-- `pricing.onboarding` is unchanged: $350 once, waived for a year paid up
-- front, and a year costs ten months -- which is still the terms.
--
-- Scoped exactly as 20260920030000 is (the one `internal` tenant with a
-- `custom_domain`), so local development and CI, which have none, are a no-op.
-- Triggers off for the writes, as there: no session in a migration.
--
-- Plan *entitlements* are not changed here. `tenants.plan` still takes
-- `internal`, `demo` and `white_label`, and every plan seeds every module;
-- making Starter, Operations and Complete real plans in `plan_modules` is its
-- own change.

do $$
declare
  v_tenant_id uuid;
  v_count int;
  v_rows int;
  v_seeded_plans constant jsonb :=
    '[{"name": "Starter",
       "price": "$29",
       "period": "per month",
       "who": "Two or three people, running today on one spreadsheet and a shared drive.",
       "includes": ["Up to 3 people with logins."],
       "cta_label": "Get started",
       "cta_href": "/contact",
       "shown": true},
      {"name": "Standard",
       "price": "$69",
       "period": "per month",
       "who": "A small staff, a board, and whoever coordinates the volunteers.",
       "includes": ["Up to 10 people with logins."],
       "cta_label": "Get started",
       "cta_href": "/contact",
       "shown": true},
      {"name": "Full",
       "price": "$129",
       "period": "per month",
       "who": "Everybody who needs to be in the system is in it, and somebody wants a reply the same day.",
       "includes": ["Unlimited logins.", "Priority support."],
       "cta_label": "Get started",
       "cta_href": "/contact",
       "shown": true}]'::jsonb;
  v_plans constant jsonb :=
    '[{"name": "Starter",
       "price": "$29",
       "period": "per month",
       "who": "A volunteer-run organization or a one-person business: a website, a contact list, events and a way to be reached.",
       "includes": ["People and your public website.",
                    "Events, with registration.",
                    "Volunteers, programs and messages.",
                    "Unlimited logins."],
       "cta_label": "Get started",
       "cta_href": "/contact",
       "shown": true},
      {"name": "Operations",
       "price": "$79",
       "period": "per month",
       "who": "An organization that handles money and things: somebody keeps the books, somebody keeps the stock.",
       "includes": ["Everything in Starter.",
                    "Finance and reimbursements.",
                    "Inventory, the content calendar and open calls."],
       "cta_label": "Get started",
       "cta_href": "/contact",
       "shown": true},
      {"name": "Complete",
       "price": "$149",
       "period": "per month",
       "who": "An organization with a board to answer to, or one that wants every part of the system.",
       "includes": ["Everything in Operations.",
                    "Governance, for nonprofits: meetings, minutes, resolutions and grants.",
                    "Conduct reports, technology and access reviews, and accounts for the people you serve.",
                    "Priority support."],
       "cta_label": "Get started",
       "cta_href": "/contact",
       "shown": true}]'::jsonb;
begin
  select count(*) into v_count
  from public.tenants
  where plan = 'internal' and custom_domain is not null;

  if v_count = 0 then
    raise notice
      '[pricing tiers] no platform tenant with a custom_domain; skipping the price rows';
    return;
  end if;

  if v_count > 1 then
    raise exception
      '[pricing tiers] % tenants are on the internal plan with a custom_domain; this migration cannot tell which one owns the product marketing site.',
      v_count;
  end if;

  select id into v_tenant_id
  from public.tenants
  where plan = 'internal' and custom_domain is not null;

  alter table public.site_content
    disable trigger set_updated_at,
    disable trigger audit_log_row;

  update public.site_content
  set value = v_plans
  where tenant_id = v_tenant_id
    and key = 'pricing.plans'
    and value = v_seeded_plans;
  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    -- Either the row was edited in the portal (leave it) or it was never
    -- written or has been deleted (write it).
    insert into public.site_content (tenant_id, key, value, published_at)
    values (v_tenant_id, 'pricing.plans', v_plans, now())
    on conflict (tenant_id, key) do nothing;
    get diagnostics v_rows = row_count;

    if v_rows = 0 then
      raise notice
        '[pricing tiers] pricing.plans has been edited since 20260920030000; leaving it as it is';
    end if;
  end if;

  insert into public.site_content (tenant_id, key, value, published_at)
  values
    (v_tenant_id, 'pricing.intro',
     '"Plans differ by which parts of the system come with them, and each one includes everything in the one before it. None of them charges per login, per contact or per donation."'::jsonb,
     now())
  on conflict (tenant_id, key) do nothing;

  alter table public.site_content
    enable trigger set_updated_at,
    enable trigger audit_log_row;
end $$;
