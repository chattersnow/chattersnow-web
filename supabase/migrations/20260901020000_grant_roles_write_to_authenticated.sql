-- Administration can create, rename, and delete custom roles: 20260822090000
-- dropped the seed-role name check for exactly that, and the roles/permissions
-- actions write public.roles through the signed-in server client. But that
-- migration only granted insert/update/delete on `resources` and
-- `role_permissions` -- public.roles itself kept its original select-only
-- grant (20260821080000), so every authenticated write to roles fails with
-- "permission denied for table roles" at the privilege layer, before RLS is
-- consulted. The existing "admin manage roles" FOR ALL policy already
-- restricts writes to admins; this grant lets it take effect.
grant insert, update, delete on public.roles to authenticated;
