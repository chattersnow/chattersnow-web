-- Links a people row to the portal login (auth.uid()) that resolves to it,
-- so the home dashboard can tell which event_volunteers rows belong to the
-- signed-in user. Populated lazily by resolve_current_person_id(), not here.

alter table public.people
  add column auth_user_id uuid references auth.users(id);

create unique index people_auth_user_id_key
  on public.people (auth_user_id) where auth_user_id is not null;
