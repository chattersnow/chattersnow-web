-- 20260830150000 created person_organizations with RLS policies for
-- authenticated (view -> select, manage -> insert/update/delete) but no
-- table grants at all, so every access -- including the People directory's
-- organization-membership feature itself -- fails with "permission denied
-- for table person_organizations" at the privilege layer, before RLS is
-- consulted. Grant the verbs the policies already gate.
grant select, insert, update, delete on public.person_organizations to authenticated;
