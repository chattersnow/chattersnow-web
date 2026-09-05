-- Issue #602, part 3 of 6: "last activity" for a person, in one place.
--
-- Two of the published retention periods are measured from a person's last
-- activity rather than from a row's own timestamp -- volunteer applications
-- ("2 years after your last activity with us") and rider profiles ("after 2
-- years of inactivity"). Neither has a column for that, and people.updated_at
-- is not it: the set_updated_at trigger bumps it whenever a staff member edits
-- a phone number, so a directory tidy-up would restart the clock on someone who
-- has not been near Chatter in three seasons.
--
-- So derive it, the way person_role_flags (20260903030000) derives a role: from
-- the records that constitute the activity. Reading it at query time also means
-- there is no stored column to fall out of date, and no ninth trigger.
--
-- Deliberately does NOT consider donations, sponsorships, board membership or
-- reimbursements. Those make a person *retained* (that check is a separate one,
-- driven by retention_purgeable_person_refs), not *active* -- a donation in
-- 2024 should not keep a 2023 rider profile alive. Keeping the two ideas apart
-- is what lets a donor's rider profile expire on schedule while their donor
-- record is untouched.
--
-- security definer for the same reason person_role_flags is: the answer must
-- not depend on whether the caller can see the evidence behind it. It is called
-- from the purge (which runs as the owner anyway) and could be called from a
-- portal read later.
create function public.person_last_activity_at(p_person_id uuid)
returns timestamptz
language sql
stable
parallel safe
security definer
set search_path = public
as $$
  select greatest(
    (select p.updated_at from public.people p where p.id = p_person_id),
    (select max(greatest(r.created_at, coalesce(r.checked_in_at, r.created_at)))
       from public.event_registrations r where r.person_id = p_person_id),
    (select max(a.updated_at)
       from public.volunteer_applications a where a.person_id = p_person_id),
    -- logged_date is a date, not a timestamptz; the cast is what lets greatest()
    -- compare it with the rest.
    (select max(h.logged_date)::timestamptz
       from public.volunteer_hours h where h.person_id = p_person_id),
    (select max(v.updated_at)
       from public.event_volunteers v where v.person_id = p_person_id),
    (select max(m.occurred_at)
       from public.inventory_movements m where m.recipient_person_id = p_person_id)
  );
$$;
