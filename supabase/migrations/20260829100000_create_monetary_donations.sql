-- monetary_donations: manual record-keeping for financial (cash) donations
-- behind Finance > Donations (spec §5.3 "Finance — donations ..."). Distinct
-- from public.donations, which is in-kind gear intake (a donor plus
-- inventory_items) -- combining the two would conflate cash received with
-- goods received. No payment processor integration here (issue #42 tracks
-- the public giving path separately); rows are entered by finance/admin from
-- the portal. Plain CRUD, no approval workflow, mirroring event_revenue
-- (20260825010000).
--
-- donor_id is nullable: an anonymous cash donation is still worth recording.
-- on delete set null keeps the financial record if the person is ever
-- removed -- the amount was received either way; the row just becomes
-- anonymous.

create table public.monetary_donations (
  id uuid primary key default gen_random_uuid(),
  donor_id uuid references public.people(id) on delete set null,
  event_id uuid references public.events(id) on delete set null,
  amount numeric(10, 2) not null check (amount >= 0),
  method text not null
    check (method in ('cash', 'check', 'card', 'bank_transfer', 'online', 'other')),
  received_date date not null default current_date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id)
);

create trigger set_updated_at before update on public.monetary_donations
  for each row execute function public.set_updated_at();

alter table public.monetary_donations enable row level security;

-- Reuses the existing `finance` resource rather than adding a new one: the
-- Finance > Donations route guard and nav entry already gate on
-- finance:manage, and the seeded matrix (20260822090000) already encodes
-- spec §5.3 for it -- admin/finance manage, everyone else none, board's
-- oversight coming only through the finance_reports rollup RPC.
create policy "monetary_donations select" on public.monetary_donations for select to authenticated
  using (public.has_permission('finance', 'view'));
create policy "monetary_donations insert" on public.monetary_donations for insert to authenticated
  with check (public.has_permission('finance', 'manage'));
create policy "monetary_donations update" on public.monetary_donations for update to authenticated
  using (public.has_permission('finance', 'manage')) with check (public.has_permission('finance', 'manage'));
create policy "monetary_donations delete" on public.monetary_donations for delete to authenticated
  using (public.has_permission('finance', 'manage'));

grant select, insert, update, delete on public.monetary_donations to authenticated;

-- Audit coverage: one additive registry insert (20260828060000) plus the
-- generic row trigger.
insert into public.audited_tables (table_name) values ('monetary_donations');

create trigger audit_log_row after insert or update or delete on public.monetary_donations
  for each row execute function public.audit_log_row();

-- The donation form's donor field uses PersonPicker, whose inline "create
-- new person" path requires people:manage or people_intake:manage. finance
-- holds people:view only, so without this the page's primary user couldn't
-- record a first-time donor. people_intake is the spec §5.3 workflow
-- carve-out built for exactly this ("create an inline contact from a
-- donation form without gaining full People-directory access").
update public.role_permissions
set level = 'manage'
where role_id = (select id from public.roles where name = 'finance')
  and resource_id = (select id from public.resources where key = 'people_intake');

-- Fold monetary donations into the finance report rollup
-- (20260828010000), whose header noted they had no table yet and stood in
-- the in-kind face value. in_kind_items stays as-is (face value, out of the
-- cash net); monetary_donations is new cash-in the summary layer adds to
-- the net. Date semantics match event_revenue: received_date, inclusive of
-- both bounds.
create or replace function public.get_finance_report_data(p_from date, p_to date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.has_permission('finance_reports', 'view') then
    raise exception 'Not authorized to view financial reports';
  end if;

  if p_from is null or p_to is null then
    raise exception 'Both a from date and a to date are required';
  end if;

  if p_from > p_to then
    raise exception 'The from date must not be after the to date';
  end if;

  select jsonb_build_object(
    'revenue', coalesce((
      select jsonb_agg(jsonb_build_object(
        'source', revs.source,
        'amount', revs.amount,
        'event_id', revs.event_id,
        'event_name', evt.name
      ))
      from public.event_revenue revs
      left join public.events evt on evt.id = revs.event_id
      where revs.received_date between p_from and p_to
    ), '[]'::jsonb),
    'expenses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'status', exps.status,
        'amount', exps.amount,
        'event_id', exps.event_id,
        'event_name', evt.name
      ))
      from public.event_expenses exps
      left join public.events evt on evt.id = exps.event_id
      where exps.expense_date between p_from and p_to
    ), '[]'::jsonb),
    'reimbursements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'status', reims.status,
        'amount', reims.amount,
        'event_id', reims.event_id,
        'event_name', evt.name
      ))
      from public.reimbursements reims
      left join public.events evt on evt.id = reims.event_id
      where reims.created_at::date between p_from and p_to
    ), '[]'::jsonb),
    'in_kind_items', coalesce((
      select jsonb_agg(jsonb_build_object('face_value', items.face_value))
      from public.inventory_items items
      join public.donations dons on dons.id = items.donation_id
      where dons.donated_at::date between p_from and p_to
    ), '[]'::jsonb),
    'monetary_donations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'amount', mds.amount,
        'event_id', mds.event_id,
        'event_name', evt.name,
        'donor_name', ppl.name
      ))
      from public.monetary_donations mds
      left join public.events evt on evt.id = mds.event_id
      left join public.people ppl on ppl.id = mds.donor_id
      where mds.received_date between p_from and p_to
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.get_finance_report_data(date, date) to authenticated;
