-- Link event_sponsors to the shared people directory instead of storing
-- redundant name/contact info per event row. Existing sponsor rows (if any)
-- are backfilled into new people records (tagged is_sponsor) before the
-- now-redundant text columns are dropped, so this is safe against
-- production data. created_by is copied from the sponsor row rather than
-- relying on auth.uid(), which resolves to null outside a PostgREST/session
-- context (e.g. when this migration runs via `supabase db push`).
alter table public.event_sponsors
  add column person_id uuid references public.people(id);

do $$
declare
  r record;
  v_person_id uuid;
begin
  for r in
    select id, name, contact_name, contact_email, contact_phone, created_by
    from public.event_sponsors
    where person_id is null
  loop
    insert into public.people (name, is_anonymous, source_type, email, phone, notes, is_sponsor, created_by)
    values (
      r.name,
      false,
      'other',
      r.contact_email,
      r.contact_phone,
      case when r.contact_name is not null then 'Event sponsor contact: ' || r.contact_name else null end,
      true,
      r.created_by
    )
    returning id into v_person_id;

    update public.event_sponsors set person_id = v_person_id where id = r.id;
  end loop;
end
$$;

alter table public.event_sponsors
  alter column person_id set not null;

alter table public.event_sponsors
  add constraint event_sponsors_event_id_person_id_key unique (event_id, person_id);

alter table public.event_sponsors
  drop column name,
  drop column contact_name,
  drop column contact_email,
  drop column contact_phone;
