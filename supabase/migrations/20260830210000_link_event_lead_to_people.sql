-- Issue #521: events.event_lead_id currently references auth.users, so an
-- event lead must be a portal user account -- it can't be a board member,
-- volunteer coordinator, or anyone else tracked only in the People
-- directory. Repoint it at public.people, mirroring
-- governance_meetings.facilitator_person_id/notetaker_person_id
-- (20260826020000_add_facilitator_notetaker_to_governance_meetings.sql).
--
-- Existing event_lead_id values (auth.users ids) are resolved to their
-- linked people row via people.auth_user_id where one exists; a people row
-- is created for any lead that doesn't already have one, same backfill
-- shape as 20260821060000_link_event_sponsors_to_people.sql. created_by is
-- set explicitly rather than relying on auth.uid(), which resolves to null
-- outside a PostgREST/session context (e.g. when this migration runs via
-- `supabase db push`).
alter table public.events
  drop constraint events_event_lead_id_fkey;

do $$
declare
  r record;
  v_person_id uuid;
begin
  for r in
    select id, event_lead_id from public.events where event_lead_id is not null
  loop
    select id into v_person_id from public.people where auth_user_id = r.event_lead_id;

    if v_person_id is null then
      insert into public.people (name, is_anonymous, source_type, email, auth_user_id, created_by)
      select
        coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', u.email),
        false,
        'other',
        u.email,
        u.id,
        u.id
      from auth.users u
      where u.id = r.event_lead_id
      returning id into v_person_id;
    end if;

    update public.events set event_lead_id = v_person_id where id = r.id;
  end loop;
end
$$;

alter table public.events
  add constraint events_event_lead_id_fkey foreign key (event_lead_id) references public.people(id);

-- list_event_leads() (auth.users/user_roles-backed) is replaced by the
-- shared PersonPicker + listPeopleAction() used for facilitator/notetaker.
drop function if exists public.list_event_leads();
