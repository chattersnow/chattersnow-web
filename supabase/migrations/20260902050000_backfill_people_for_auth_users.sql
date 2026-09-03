-- Backfill for accounts that existed before ensure_current_person()
-- (20260902040000) started creating a people row at login. Without this, an
-- existing admin or event coordinator does not appear in the calendar owner
-- picker until the next time they sign in.
--
-- Same two-step rule as resolve_current_person_id(): link an existing
-- unlinked people row by email first, and only insert when there is nothing
-- to link. created_by is set explicitly -- auth.uid() is null when this runs
-- under `supabase db push`, and people.created_by has been nullable since
-- 20260824150000, so relying on the default would silently record null.
--
-- Note this migration runs *before* supabase/seed.sql on `db reset`, so it
-- does not cover the seeded local accounts; seed.sql inserts their people
-- rows itself.

do $$
declare
  u record;
  v_person_id uuid;
begin
  for u in
    select au.id, au.email, au.raw_user_meta_data
      from auth.users au
     where not exists (
       select 1 from public.people p where p.auth_user_id = au.id
     )
  loop
    select p.id into v_person_id
      from public.people p
     where p.auth_user_id is null
       and u.email is not null
       and lower(p.email) = lower(u.email)
     order by p.created_at asc
     limit 1;

    if v_person_id is not null then
      update public.people set auth_user_id = u.id where id = v_person_id;
    else
      insert into public.people (name, is_anonymous, source_type, email, auth_user_id, created_by)
      values (
        coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', u.email),
        false,
        'other',
        u.email,
        u.id,
        u.id
      );
    end if;
  end loop;
end
$$;
