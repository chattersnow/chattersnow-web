-- Access Management MVP (issue #424): register the two resource keys named
-- in the requirements review (docs/technical-spec.md §17.1) in the existing
-- resources/role_permissions matrix -- no new portal-role tier system.
--
-- access_management_assets gates the asset/service/access-grant registry
-- itself (view/manage). access_management_reviews is narrower: it lets a
-- role record an asset review (update last_reviewed/next_review) without
-- otherwise being able to add, edit, or remove assets or grants -- see the
-- assets/access_grants UPDATE policies in the two preceding migrations.
--
-- Only admin gets access by default, same conservative default as
-- 20260825020000_add_programs_reports_resource.sql for a new resource with
-- no obvious existing-role fit; an administrator can grant other roles
-- view/manage from the Permissions screen once real usage patterns emerge.
insert into public.resources (key, section, label, description, sort_order) values
  ('access_management_assets', 'Administration', 'Access management: assets', 'External technology asset/access registry (services, assets, access grants) -- not a credential store', 130),
  ('access_management_reviews', 'Administration', 'Access management: reviews', 'Record a periodic access review on an asset without full asset-management rights', 131);

insert into public.role_permissions (role_id, resource_id, level)
select r.id, res.id, v.level
from (values
  ('admin', 'access_management_assets', 'manage'),
  ('event_coordinator', 'access_management_assets', 'none'),
  ('finance', 'access_management_assets', 'none'),
  ('board', 'access_management_assets', 'none'),
  ('volunteer', 'access_management_assets', 'none'),
  ('admin', 'access_management_reviews', 'manage'),
  ('event_coordinator', 'access_management_reviews', 'none'),
  ('finance', 'access_management_reviews', 'none'),
  ('board', 'access_management_reviews', 'none'),
  ('volunteer', 'access_management_reviews', 'none')
) as v(role_name, resource_key, level)
join public.roles r on r.name = v.role_name
join public.resources res on res.key = v.resource_key;
