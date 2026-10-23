-- #1480: form analytics (PostHog) becomes a per-tenant module.
--
-- The public site may send PostHog cookieless page views and the event
-- registration funnel's named events (src/lib/analytics). A tenant's privacy
-- policy has to name PostHog before its visitors are counted, so the switch is
-- off by default and the platform's default policy names PostHog only where it
-- is on (`formAnalytics` in src/lib/legal-surface.ts).
--
-- No resource: nothing in the portal reads or writes through this module. The
-- public layout reads it through `public_tenant_modules`, and the app turns it
-- on only on production deploys with NEXT_PUBLIC_POSTHOG_KEY set.

insert into public.modules (key, label, description, sort_order, default_enabled, is_core) values
  ('form_analytics', 'Form analytics',
   'Cookieless PostHog counts of how many visitors start and finish the public site''s forms, starting with event registration. Turn on only once the organization''s privacy policy names PostHog.',
   16, false, false);

-- Seeded for all three plans so provision_tenant(), which reads this table,
-- keeps giving a new tenant a complete set of rows. On for `demo`: its policy
-- is the platform default, which names PostHog once this module is on.
insert into public.plan_modules (plan, module_key, enabled)
select p.plan, 'form_analytics', p.plan = 'demo'
from (values ('internal'), ('demo'), ('white_label')) as p(plan);

-- The live demo tenant, named by its plan rather than a slug: there is one,
-- and on a database without one (local, CI) this is a clean no-op. Every other
-- tenant, Chatter Snow included, stays off until its own policy names PostHog
-- (#1320).
insert into public.tenant_modules (tenant_id, module_key, enabled)
select t.id, 'form_analytics', true
from public.tenants t
where t.plan = 'demo'
on conflict (tenant_id, module_key) do nothing;
