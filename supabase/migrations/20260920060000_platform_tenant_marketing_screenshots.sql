-- #1332: the Coven site's pictures — the home strip, the module tour, the two
-- audience paths and the Learn section — pointed at the frames committed under
-- `public/coven/`.
--
-- ## Where they come from, and why that is not negotiable
--
-- Every one was taken against the **demo tenant** (`demo.rickiecruz.com`),
-- which is invented data rebuilt from scratch every night. `docs/licensing.md`
-- is unambiguous that any row in any table is Organization Material, so a
-- marketing screenshot may not come from a production tenant — and a blurred
-- name is still a real person's record having been opened to take the picture.
-- Each frame was read before it was committed: every address in them is
-- `@demo.invalid`, and the People frame is sorted by email precisely so the one
-- row carrying a real mailbox (the demo account's own) is not in it.
--
-- ## Why a path rather than a URL
--
-- An image slot stores a URL or a root-relative path (`isRenderableImageSrc`),
-- and these are the product's own marketing assets rather than a tenant's
-- photography, so they live in the repository beside the pages they illustrate
-- and are deployed with them. That also means they cost nothing to host, which
-- `docs/licensing.md`'s `public/**` row now says out loud.
--
-- ## Which picture goes where
--
-- The tour pages take theirs positionally: the code side of this ticket gives
-- each default section a `photo_slot` — the Nth section takes the Nth slot —
-- so the platform tenant needs no copy of the section lists to point at a
-- screenshot. Sections beyond the third on an audience page stay words only,
-- which `tour-page.tsx` renders full width rather than as an empty frame.
--
-- The business path deliberately gets the expense ledger rather than the
-- donation one: #998's obvious failure mode is a business visitor meeting donor
-- screens, and the demo tenant is a nonprofit. A second demo tenant on the
-- business path is the real answer and is not a launch blocker; until it
-- exists, the frames chosen here are the ones whose vocabulary is neutral —
-- expenses, a calendar, a people directory.
--
-- Everything is `on conflict do nothing`, so an editor who replaces one of
-- these in Administration > Site Content keeps their version.

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
      '[#1332] no platform tenant with a custom_domain; skipping the marketing screenshots';
    return;
  end if;

  if v_count > 1 then
    raise exception
      '[#1332] % tenants are on the internal plan with a custom_domain; this migration cannot tell which one owns the product marketing site. Put the customer tenants on their real plan, or name the platform slug here.',
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
    -- The home strip, at 21/9 because that is what the carousel crops to: a
    -- frame captured at any other shape loses the part that was the point.
    (v_tenant_id, 'site_images.home_carousel_1',
     to_jsonb('/coven/home-dashboard-21x9.png'::text), now()),
    (v_tenant_id, 'site_images.home_carousel_2',
     to_jsonb('/coven/home-financial-reports-21x9.png'::text), now()),
    (v_tenant_id, 'site_images.home_carousel_3',
     to_jsonb('/coven/home-events-21x9.png'::text), now()),

    -- The module tour, one per section, in the sections' own order: finance,
    -- people, events, volunteers, programs, inventory, governance, calendar.
    (v_tenant_id, 'site_images.module_tour_photo_1',
     to_jsonb('/coven/module-finance.png'::text), now()),
    (v_tenant_id, 'site_images.module_tour_photo_2',
     to_jsonb('/coven/module-people.png'::text), now()),
    (v_tenant_id, 'site_images.module_tour_photo_3',
     to_jsonb('/coven/module-events.png'::text), now()),
    (v_tenant_id, 'site_images.module_tour_photo_4',
     to_jsonb('/coven/module-volunteers.png'::text), now()),
    (v_tenant_id, 'site_images.module_tour_photo_5',
     to_jsonb('/coven/module-programs.png'::text), now()),
    (v_tenant_id, 'site_images.module_tour_photo_6',
     to_jsonb('/coven/module-inventory.png'::text), now()),
    (v_tenant_id, 'site_images.module_tour_photo_7',
     to_jsonb('/coven/module-governance.png'::text), now()),
    (v_tenant_id, 'site_images.module_tour_photo_8',
     to_jsonb('/coven/module-calendar.png'::text), now()),

    -- /nonprofits leads on governance, which is the part no donor database
    -- has, then the money, then the people.
    (v_tenant_id, 'site_images.audience_nonprofits_photo_1',
     to_jsonb('/coven/module-governance.png'::text), now()),
    (v_tenant_id, 'site_images.audience_nonprofits_photo_2',
     to_jsonb('/coven/nonprofit-donations.png'::text), now()),
    (v_tenant_id, 'site_images.audience_nonprofits_photo_3',
     to_jsonb('/coven/module-people.png'::text), now()),

    -- /business: money out, the people directory, the bookings. No donation
    -- ledger with a different caption on it.
    (v_tenant_id, 'site_images.audience_business_photo_1',
     to_jsonb('/coven/business-expenses.png'::text), now()),
    (v_tenant_id, 'site_images.audience_business_photo_2',
     to_jsonb('/coven/module-people.png'::text), now()),
    (v_tenant_id, 'site_images.audience_business_photo_3',
     to_jsonb('/coven/module-events.png'::text), now()),

    -- Learn renders a 21/9 picture under every one of its pages, and an unset
    -- slot is a grey placeholder the width of the column — which is what the
    -- security article and the FAQ (#1331) would otherwise sit above.
    (v_tenant_id, 'site_images.learn_photo',
     to_jsonb('/coven/learn-calendar-21x9.png'::text), now())
  on conflict (tenant_id, key) do nothing;

  alter table public.site_content
    enable trigger set_updated_at,
    enable trigger audit_log_row;
end $$;
