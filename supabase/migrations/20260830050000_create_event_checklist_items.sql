-- Free-form per-event checklist, backing the "Checklist" tab and the
-- dashboard's derived "Outstanding tasks" summary. Rides on the generic
-- events resource, same as most other per-event sub-tables (event_sponsors,
-- event_logistics, event_volunteers) -- checklist items aren't sensitive the
-- way incident detail is, so they don't need their own resource key.

create table public.event_checklist_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  title text not null,
  is_done boolean not null default false,
  completed_at timestamptz,
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create trigger set_updated_at before update on public.event_checklist_items
  for each row execute function public.set_updated_at();

alter table public.event_checklist_items enable row level security;

create policy "event_checklist_items select" on public.event_checklist_items for select to authenticated
  using (public.has_permission('events', 'view'));
create policy "event_checklist_items insert" on public.event_checklist_items for insert to authenticated
  with check (public.has_permission('events', 'manage'));
create policy "event_checklist_items update" on public.event_checklist_items for update to authenticated
  using (public.has_permission('events', 'manage'))
  with check (public.has_permission('events', 'manage'));
create policy "event_checklist_items delete" on public.event_checklist_items for delete to authenticated
  using (public.has_permission('events', 'manage'));

grant select, insert, update, delete on public.event_checklist_items to authenticated;

insert into public.audited_tables (table_name) values ('event_checklist_items');
create trigger audit_log_row after insert or update or delete on public.event_checklist_items
  for each row execute function public.audit_log_row();
