-- Governance: drop the `minutes` table (issue #408). The Minutes tab
-- duplicated the Agenda tab (external link + free-text body), so Agenda's
-- notes field now doubles as the before/after-the-meeting notes record.
-- Nothing else references `minutes` -- dropping the table also drops its
-- policies, trigger, and grants.

drop table public.minutes;
