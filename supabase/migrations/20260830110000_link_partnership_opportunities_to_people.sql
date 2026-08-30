-- Link partnership_opportunities to the shared people directory instead of
-- storing redundant organization/contact text per row, same treatment
-- event_sponsors already got in 20260821060000. Existing rows are backfilled
-- into new people records before the now-redundant text columns are
-- dropped, so this is safe against production data. created_by is copied
-- from the opportunity row rather than relying on auth.uid(), which
-- resolves to null outside a PostgREST/session context (e.g. when this
-- migration runs via `supabase db push`) -- same reasoning as
-- 20260821060000.

alter table public.partnership_opportunities
  add column organization_person_id uuid references public.people(id);

do $$
declare
  r record;
  v_person_id uuid;
begin
  for r in
    select id, organization_name, contact_name, contact_email, created_by
    from public.partnership_opportunities
    where organization_person_id is null
  loop
    insert into public.people (name, is_anonymous, source_type, email, phone, notes, created_by)
    values (
      r.organization_name,
      false,
      'other',
      r.contact_email,
      null,
      case when r.contact_name is not null then 'Partnership contact: ' || r.contact_name else null end,
      r.created_by
    )
    returning id into v_person_id;

    update public.partnership_opportunities set organization_person_id = v_person_id where id = r.id;
  end loop;
end
$$;

alter table public.partnership_opportunities
  alter column organization_person_id set not null;

alter table public.partnership_opportunities
  drop column organization_name,
  drop column contact_name,
  drop column contact_email;

create index partnership_opportunities_organization_person_id_idx
  on public.partnership_opportunities (organization_person_id);
