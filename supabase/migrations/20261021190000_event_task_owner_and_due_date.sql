-- #1660 (step 2 of #1643): an optional owner and due date on the two event
-- tasks that had neither -- a checklist item, and a sponsor's follow-up.
--
-- Every other task in the portal already says who has it and when it is due
-- (meeting action items, milestones, annual requirements, retro actions). These
-- two could only say whether they were done, so a list of open work across
-- events had nobody to show against them. The manageable Events list (#1643's
-- other half) reads these columns; this migration only adds them and the forms.
--
-- The sponsor's follow-up is not a table of its own: it is the
-- `follow_up_status` / `follow_up_notes` pair on `event_sponsors`
-- (20260822060000), so its owner and due date are two more columns on the same
-- row, prefixed the same way.
--
-- Both owners are tenant-checked by a composite foreign key onto
-- `people (tenant_id, id)`, as `event_retro_items_owner_in_tenant`
-- (20261011190000) does, so a person from another tenant is refused by the
-- database whichever path writes the row -- the sponsor RPCs are security
-- definer and bypass RLS. Deleting the person clears the owner and keeps the
-- task. RLS is unchanged: both tables are already gated on events view/manage,
-- and the new columns ride on the row's existing grants.
--
-- Additive and nullable, so `main` (which predates this) keeps working: it
-- never selects the columns, and the redefined sponsor RPCs default the two new
-- arguments, so its named-argument calls still resolve.

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------

alter table public.event_checklist_items
  add column owner_person_id uuid,
  add column due_date date,
  add constraint event_checklist_items_owner_in_tenant
    foreign key (tenant_id, owner_person_id)
    references public.people (tenant_id, id) on delete set null (owner_person_id);

create index event_checklist_items_owner_idx
  on public.event_checklist_items (owner_person_id)
  where owner_person_id is not null;

comment on column public.event_checklist_items.owner_person_id is
  'Who has this checklist item (#1660). Optional; must be a person in the row''s tenant (event_checklist_items_owner_in_tenant).';
comment on column public.event_checklist_items.due_date is
  'When the item is due, date only (#1660). Optional; the add dialog prefills the event''s date.';

alter table public.event_sponsors
  add column follow_up_owner_person_id uuid,
  add column follow_up_due_date date,
  add constraint event_sponsors_follow_up_owner_in_tenant
    foreign key (tenant_id, follow_up_owner_person_id)
    references public.people (tenant_id, id) on delete set null (follow_up_owner_person_id);

create index event_sponsors_follow_up_owner_idx
  on public.event_sponsors (follow_up_owner_person_id)
  where follow_up_owner_person_id is not null;

comment on column public.event_sponsors.follow_up_owner_person_id is
  'Who has the partner follow-up on this sponsorship (#1660). Optional; must be a person in the row''s tenant (event_sponsors_follow_up_owner_in_tenant).';
comment on column public.event_sponsors.follow_up_due_date is
  'When the partner follow-up is due, date only (#1660). Optional; a new sponsorship prefills the event''s date.';

-- ---------------------------------------------------------------------------
-- 2. The sponsor write RPCs
-- ---------------------------------------------------------------------------

-- Drop+create rather than `create or replace`: a longer parameter list would
-- otherwise sit beside the old one as a second overload. Bodies are
-- 20260912140000's with the two follow-up columns added.
drop function if exists public.create_event_sponsor(uuid, uuid, text, numeric, boolean, text, text, text, jsonb);
drop function if exists public.update_event_sponsor(uuid, text, numeric, boolean, text, text, text, jsonb);

create function public.create_event_sponsor(
  p_event_id uuid,
  p_person_id uuid,
  p_support_type text,
  p_contribution_value numeric,
  p_is_public boolean,
  p_notes text,
  p_follow_up_status text,
  p_follow_up_notes text,
  p_items jsonb default '[]'::jsonb,
  p_follow_up_owner_person_id uuid default null,
  p_follow_up_due_date date default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sponsor_id uuid;
  v_tenant_id uuid := public.current_tenant_id();
begin
  if not public.has_permission('events', 'manage') then
    raise exception 'Not authorized to manage sponsors';
  end if;

  if not exists (select 1 from public.events where id = p_event_id and tenant_id = v_tenant_id) then
    raise exception 'Event not found';
  end if;
  if not exists (select 1 from public.people where id = p_person_id and tenant_id = v_tenant_id) then
    raise exception 'No such person';
  end if;

  insert into public.event_sponsors (
    event_id, person_id, support_type, contribution_value,
    is_public, notes, follow_up_status, follow_up_notes,
    follow_up_owner_person_id, follow_up_due_date
  )
  values (
    p_event_id, p_person_id, p_support_type, p_contribution_value,
    p_is_public, p_notes, p_follow_up_status, p_follow_up_notes,
    p_follow_up_owner_person_id, p_follow_up_due_date
  )
  returning id into v_sponsor_id;

  perform public.sync_event_sponsor_donations(v_sponsor_id, p_items);

  return v_sponsor_id;
end;
$$;

create function public.update_event_sponsor(
  p_id uuid,
  p_support_type text,
  p_contribution_value numeric,
  p_is_public boolean,
  p_notes text,
  p_follow_up_status text,
  p_follow_up_notes text,
  p_items jsonb default '[]'::jsonb,
  p_follow_up_owner_person_id uuid default null,
  p_follow_up_due_date date default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission('events', 'manage') then
    raise exception 'Not authorized to manage sponsors';
  end if;

  update public.event_sponsors
  set support_type = p_support_type,
      contribution_value = p_contribution_value,
      is_public = p_is_public,
      notes = p_notes,
      follow_up_status = p_follow_up_status,
      follow_up_notes = p_follow_up_notes,
      follow_up_owner_person_id = p_follow_up_owner_person_id,
      follow_up_due_date = p_follow_up_due_date
  where id = p_id
    and tenant_id = (select public.current_tenant_id());

  if not found then
    raise exception 'Sponsor not found';
  end if;

  perform public.sync_event_sponsor_donations(p_id, p_items);
end;
$$;

grant execute on function public.create_event_sponsor(
  uuid, uuid, text, numeric, boolean, text, text, text, jsonb, uuid, date
) to authenticated;
grant execute on function public.update_event_sponsor(
  uuid, text, numeric, boolean, text, text, text, jsonb, uuid, date
) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Demo tenant seed
-- ---------------------------------------------------------------------------

-- The nightly demo reset gets owned and dated tasks to show: a follow-up owner
-- on both sponsorships and a few checklist items across the events, one of
-- them overdue and one unowned. Patched in place, as 20261020120000 did, since
-- seed_demo_tenant() is several hundred lines and this is an append after its
-- sponsor insert. The anchor must match exactly once.
--
-- Chatter Snow's own rows are left alone: they are a real organization's
-- tasks, and who owns them is theirs to set in the portal.
do $patch$
declare
  v_signature constant text := 'public.seed_demo_tenant(uuid, uuid, uuid)';
  v_find constant text := '(t, ev_social, p_outfitters, ''in_kind'', ''Giveaway prizes.'', 650.00, true, ''in_progress'', actor);';
  v_def text;
  v_count int;
begin
  v_def := pg_get_functiondef(v_signature::regprocedure);
  v_count := (length(v_def) - length(replace(v_def, v_find, ''))) / length(v_find);
  if v_count <> 1 then
    raise exception '#1660: expected one match in %, found %', v_signature, v_count;
  end if;

  execute replace(v_def, v_find, v_find || $seed$

  update public.event_sponsors
  set follow_up_owner_person_id = p_rowan,
      follow_up_due_date = (now() - interval '35 days')::date
  where tenant_id = t and event_id = ev_opener;
  update public.event_sponsors
  set follow_up_owner_person_id = p_sasha,
      follow_up_due_date = (now() + interval '55 days')::date
  where tenant_id = t and event_id = ev_social;

  insert into public.event_checklist_items (tenant_id, event_id, title, is_done, completed_at, owner_person_id, due_date, created_by)
  values
    (t, ev_opener, 'Return the borrowed radios', true, now() - interval '41 days', p_ines, (now() - interval '41 days')::date, actor),
    (t, ev_opener, 'Send thank-you notes to the resort', false, null, p_rowan, (now() - interval '30 days')::date, actor),
    (t, ev_fitting, 'Confirm the boot-fitting volunteers', false, null, p_rowan, (now() + interval '12 days')::date, actor),
    (t, ev_fitting, 'Print sign-in sheets', false, null, p_ines, (now() + interval '19 days')::date, actor),
    (t, ev_social, 'Collect giveaway prizes from sponsors', false, null, p_sasha, (now() + interval '40 days')::date, actor),
    (t, ev_social, 'Book a photographer', false, null, null, (now() + interval '30 days')::date, actor);$seed$);
end
$patch$;
