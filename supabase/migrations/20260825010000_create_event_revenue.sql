-- event_revenue: non-sponsorship revenue an event brings in directly
-- (spec §6, issue #27). event_sponsors already tracks sponsorship
-- commitments/amounts separately, so 'sponsorship' is deliberately excluded
-- from the source enum below -- combining event_revenue + event_sponsors in
-- a future rollup would otherwise double-count. No approval workflow here
-- (unlike event_expenses): plain CRUD, matching the issue's minimal column
-- list (source, amount, event FK, timestamps).

create table public.event_revenue (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete set null,
  source text not null
    check (source in ('ticket_sales', 'registration_fees', 'merchandise', 'onsite_donations', 'grants', 'other')),
  amount numeric(10, 2) not null check (amount >= 0),
  received_date date not null default current_date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id)
);

create trigger set_updated_at before update on public.event_revenue
  for each row execute function public.set_updated_at();

alter table public.event_revenue enable row level security;

create policy "event_revenue select" on public.event_revenue for select to authenticated
  using (public.has_permission('event_revenue', 'view'));
create policy "event_revenue insert" on public.event_revenue for insert to authenticated
  with check (public.has_permission('event_revenue', 'manage'));
create policy "event_revenue update" on public.event_revenue for update to authenticated
  using (public.has_permission('event_revenue', 'manage')) with check (public.has_permission('event_revenue', 'manage'));
create policy "event_revenue delete" on public.event_revenue for delete to authenticated
  using (public.has_permission('event_revenue', 'manage'));

grant select, insert, update, delete on public.event_revenue to authenticated;

-- Resource + role grants, mirroring event_expenses exactly (admin/
-- event_coordinator/finance manage; board/volunteer none) but as its own
-- dedicated resource rather than reusing event_expenses's.
insert into public.resources (key, section, label, description, sort_order) values
  ('event_revenue', 'Events', 'Event revenue', 'Event-level revenue records (ticket sales, registration fees, merchandise, onsite donations, grants)', 25);

insert into public.role_permissions (role_id, resource_id, level)
select r.id, res.id, v.level
from (values
  ('admin', 'event_revenue', 'manage'),
  ('event_coordinator', 'event_revenue', 'manage'),
  ('finance', 'event_revenue', 'manage'),
  ('board', 'event_revenue', 'none'),
  ('volunteer', 'event_revenue', 'none')
) as v(role_name, resource_key, level)
join public.roles r on r.name = v.role_name
join public.resources res on res.key = v.resource_key;

-- Same audited set as donations/event_expenses/etc. -- widen the table_name
-- allow-list to include event_revenue.
do $$
declare
  v_constraint_name text;
begin
  select conname into v_constraint_name
  from pg_constraint
  where conrelid = 'public.audit_log'::regclass and contype = 'c' and conname like '%table_name%';

  if v_constraint_name is not null then
    execute format('alter table public.audit_log drop constraint %I', v_constraint_name);
  end if;
end $$;

alter table public.audit_log
  add constraint audit_log_table_name_check
  check (table_name in ('donations', 'inventory_items', 'inventory_movements', 'event_expenses', 'user_roles', 'app_settings', 'calendar_items', 'pending_role_grants', 'content_opportunities', 'deactivated_users', 'event_revenue'));

create trigger audit_log_row after insert or update or delete on public.event_revenue
  for each row execute function public.audit_log_row();
