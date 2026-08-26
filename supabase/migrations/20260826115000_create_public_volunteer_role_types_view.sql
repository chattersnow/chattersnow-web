-- auto_expose_new_tables is off in this project's config, so the grant below is required alongside the view definition.
create view public.public_volunteer_role_types as
select id, name, description
from public.volunteer_role_types
where is_public = true;

grant select on public.public_volunteer_role_types to anon, authenticated;
