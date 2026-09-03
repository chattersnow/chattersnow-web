-- Issue: assigning an owner behaves differently depending on where you are in
-- the portal. calendar_items.owner_id and content_opportunities.owner_id /
-- reviewer_id reference auth.users, so the calendar's owner picker can only
-- offer -- and can only display -- email addresses (list_calendar_owners()
-- returns nothing but (user_id, email)). Every other owner-ish column in the
-- schema already references public.people and shows a name.
--
-- events.event_lead_id made exactly this move in
-- 20260830210000_link_event_lead_to_people.sql; this mirrors it for the last
-- three holdouts. Existing values (auth.users ids) resolve to their linked
-- people row via people.auth_user_id, and a people row is created for any
-- owner that doesn't have one yet.
--
-- Deliberately NOT repointed: content_opportunities.status_changed_by and
-- calendar_items.sensitive_review_by. Those are actor audit stamps, in the
-- same family as created_by/updated_by on these very tables (and
-- submitted_by/approved_by/paid_by on expenses), all of which are auth.users
-- schema-wide. Repointing one column of an audit triple would make it mean
-- something different from its two siblings, and would let a recorded action
-- be re-attributed by editing an unrelated People row.
--
-- created_by is set explicitly rather than relying on auth.uid(): it resolves
-- to null outside a PostgREST/session context (e.g. `supabase db push`), and
-- since 20260824150000 made people.created_by nullable that now fails
-- silently as created_by = null instead of erroring.

alter table public.calendar_items
  drop constraint calendar_items_owner_id_fkey;

alter table public.content_opportunities
  drop constraint content_opportunities_owner_id_fkey,
  drop constraint content_opportunities_reviewer_id_fkey;

do $$
declare
  r record;
  v_person_id uuid;
begin
  -- One pass over every distinct auth id still referenced by the three
  -- columns. The `in (select id from auth.users)` guard scopes this to
  -- unconverted values: without it, re-running against partly-converted data
  -- would treat a people id as an auth id and insert duplicate people rows.
  -- (The event-lead precedent lacks this guard.)
  for r in
    select distinct owner_id as auth_user_id
      from public.calendar_items
     where owner_id is not null
       and owner_id in (select id from auth.users)
    union
    select distinct owner_id
      from public.content_opportunities
     where owner_id is not null
       and owner_id in (select id from auth.users)
    union
    select distinct reviewer_id
      from public.content_opportunities
     where reviewer_id is not null
       and reviewer_id in (select id from auth.users)
  loop
    select id into v_person_id
      from public.people
     where auth_user_id = r.auth_user_id;

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
      where u.id = r.auth_user_id
      returning id into v_person_id;
    end if;

    update public.calendar_items
       set owner_id = v_person_id
     where owner_id = r.auth_user_id;

    update public.content_opportunities
       set owner_id = v_person_id
     where owner_id = r.auth_user_id;

    update public.content_opportunities
       set reviewer_id = v_person_id
     where reviewer_id = r.auth_user_id;
  end loop;
end
$$;

alter table public.calendar_items
  add constraint calendar_items_owner_id_fkey
  foreign key (owner_id) references public.people(id);

alter table public.content_opportunities
  add constraint content_opportunities_owner_id_fkey
  foreign key (owner_id) references public.people(id),
  add constraint content_opportunities_reviewer_id_fkey
  foreign key (reviewer_id) references public.people(id);

-- calendar_items_owner_id_idx / content_opportunities_owner_id_idx /
-- content_opportunities_reviewer_id_idx (20260824110000) need no action --
-- same columns, same type. public_calendar_items does not expose owner_id,
-- so no view rebuild either.
