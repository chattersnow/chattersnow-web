-- #1329 / #1330: the platform tenant's module tour, and its prices.
--
-- The sibling of 20260920020000, which did this for the home page and the two
-- audience paths, and it works the same way for the same reasons: the words are
-- data, so they are portal-editable and need no deploy, and an editor's later
-- change wins because every insert below is `on conflict do nothing`.
--
-- ## What is here and why it is not a registry default
--
-- Only the things Core cannot honestly say for every operator running this
-- code:
--
--   * `module_tour.ctas` -- a destination is a host. The demo lives on a
--     `custom_domain` value rather than anything in the repository.
--   * `pricing.plans`' figures and `pricing.onboarding`'s fee -- a price is a
--     commercial term, and another operator charges its own. The *shape* of the
--     price list is in `src/lib/site-content.ts`: three sizes, every module on
--     every plan, sized by how many people need a login. Only the numbers are
--     here, and every registry default price is an em dash.
--
-- ## The numbers below are a proposal
--
-- #998's open question 4 says nothing is decided. These are a starting point
-- sized against what the market charges a small organization -- the entry
-- donor tools are around $45 a month and the full ones $99 to $125, which is
-- the range this undercuts while including every module -- and they are written
-- here rather than agreed. Whoever sets prices changes them in Administration >
-- Site Content without a deploy, which is the whole point of them being rows.
--
-- ## The tour is turned on. Pricing is not.
--
-- `page_visibility.modules` is switched on for this tenant: the page is
-- complete, and its screenshots (#1332) are image slots that fill in later
-- without it going dark in the meantime.
--
-- `page_visibility.pricing` is deliberately left off, including here. The page
-- is written and reachable from the portal's own preview, and it stays
-- unpublished until somebody has agreed to the figures above. An unapproved
-- price is the one thing on this site that gets quoted back at you.
--
-- Triggers off, per 20260908000000 and 20260912050000: there is no session in a
-- migration, so `set_updated_at` would stamp a null actor and `audit_log_row`
-- would write actorless entries into the tenant's audit log.

do $$
declare
  v_tenant_id uuid;
  v_count int;
begin
  -- Scoped by plan and by having a domain at all, exactly as 20260920020000 is:
  -- slugs are `service_role`-only and this deployment's platform slug is not
  -- written down in the repository, so naming one here would be a guess that
  -- silently no-ops. The bootstrap tenant `20260905190000_seed_initial_tenant.sql`
  -- creates is also `internal` and has no `custom_domain`, which is what keeps
  -- local development and CI out of this; `supabase/seed.sql` gives them their
  -- own copy.
  select count(*) into v_count
  from public.tenants
  where plan = 'internal' and custom_domain is not null;

  if v_count = 0 then
    raise notice
      '[#1329] no platform tenant with a custom_domain; skipping the tour and pricing rows';
    return;
  end if;

  if v_count > 1 then
    raise exception
      '[#1329] % tenants are on the internal plan with a custom_domain; this migration cannot tell which one owns the product marketing site. Put the customer tenants on their real plan, or name the platform slug here.',
      v_count;
  end if;

  select id into v_tenant_id
  from public.tenants
  where plan = 'internal' and custom_domain is not null;

  alter table public.site_content
    disable trigger set_updated_at,
    disable trigger audit_log_row;

  insert into public.site_content (tenant_id, key, value, published_at)
  values
    -- Two buttons, and the second one is the useful property of routing a link
    -- through page visibility: `/pricing` is hidden today, so `liveCtas()`
    -- leaves it off the page, and the day somebody publishes the price list the
    -- button appears without anybody remembering to add it.
    (v_tenant_id, 'module_tour.ctas',
     '[{"label": "Try the demo", "href": "https://demo.rickiecruz.com", "shown": true},
       {"label": "What it costs", "href": "/pricing", "shown": true}]'::jsonb,
     now()),
    -- Sized by how many people need a login, not by which modules you may use.
    -- Every plan carries the whole system, which is what makes the argument on
    -- /modules -- that the combination is the product -- something this page
    -- does not then contradict.
    (v_tenant_id, 'pricing.plans',
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
        "shown": true}]'::jsonb,
     now()),
    (v_tenant_id, 'pricing.onboarding',
     '["Getting started is $350, once: your existing spreadsheets brought in, your domain and branding set up, and two hours with whoever is going to run it.",
       "It is waived if you pay for a year up front, and a year costs ten months rather than twelve."]'::jsonb,
     now())
  on conflict (tenant_id, key) do nothing;

  alter table public.site_content
    enable trigger set_updated_at,
    enable trigger audit_log_row;

  -- The tour, on for this tenant and this tenant only. Pricing is not here on
  -- purpose -- see the header.
  insert into public.app_settings (tenant_id, key, value)
  values (v_tenant_id, 'page_visibility.modules', to_jsonb(true))
  on conflict (tenant_id, key) do nothing;
end $$;
