-- Link giveaway_prizes to the shared people directory instead of storing a
-- free-text donor name. Existing prize rows are backfilled into new people
-- records (tagged is_donor) before the now-redundant donor_name column is
-- dropped, so this is safe against production data. created_by is copied
-- from the prize row rather than relying on auth.uid(), which resolves to
-- null outside a session context when this migration runs via
-- `supabase db push`. Unlike event_sponsors.person_id, donor_person_id
-- stays nullable: a prize donor was always optional.
alter table public.giveaway_prizes
  add column donor_person_id uuid references public.people(id);

do $$
declare
  r record;
  v_person_id uuid;
begin
  for r in
    select id, donor_name, created_by
    from public.giveaway_prizes
    where donor_person_id is null and donor_name is not null
  loop
    insert into public.people (name, is_anonymous, source_type, is_donor, created_by)
    values (r.donor_name, false, 'other', true, r.created_by)
    returning id into v_person_id;

    update public.giveaway_prizes set donor_person_id = v_person_id where id = r.id;
  end loop;
end
$$;

alter table public.giveaway_prizes
  drop column donor_name;
