-- Lets the distribution-recipient picker search people for a plain
-- volunteer, who has inventory_intake:manage but not people:view. Reuses
-- the people_intake resource already granted to volunteer for the inline
-- contact-creation carve-out (people insert, 20260822100000) and extends
-- it to select.

drop policy "people select" on public.people;
create policy "people select" on public.people for select to authenticated
  using (public.has_permission('people', 'view') or public.has_permission('people_intake', 'manage'));
