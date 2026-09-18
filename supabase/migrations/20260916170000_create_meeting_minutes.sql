-- Minutes as a record of their own, seeded from the agenda (#1199).
--
-- Since #408 (20260828050000) "the minutes" have been `agendas.body_text`,
-- labelled "Meeting notes". That left the agenda doing two jobs badly: its
-- structured content -- opening checklist, carried-over action items, the seven
-- standing board sections, new business, decisions, upcoming dates, parking
-- lot, next meeting -- is a plan, and there was nowhere to write down what
-- actually happened against each part of it, so everything landed in one
-- textarea. Worse, writing it overwrote the plan: one mutable agenda row per
-- meeting means "what was planned" and "what happened" are the same fields.
--
-- Why this is not the table #408 dropped. That `minutes` row held
-- `external_link` + `body_text` and nothing else -- a genuine duplicate of the
-- agenda's two fields, and deleting it was right. This is a different thing:
--
--   * a frozen ordered snapshot of the agenda (`agenda_snapshot`), taken when
--     the notetaker starts, so later agenda edits cannot move the structure
--     under them mid-meeting;
--   * per-item notes keyed to that snapshot (`notes`), which the agenda cannot
--     express because the agenda is the plan and is still being edited; and
--   * a draft -> final lifecycle with a finalizer.
--
-- None of the three has anywhere to live on `agendas`. This is not a second
-- free-text box.

-- ---------------------------------------------------------------------------
-- 1. The record
-- ---------------------------------------------------------------------------

create table public.meeting_minutes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) default public.default_tenant_id(),
  meeting_id uuid not null,
  -- Frozen at "Start minutes": the ordered item list the notetaker works down.
  -- A copy, not a join, so later agenda edits cannot move the structure under
  -- them mid-meeting. Shape and version are in
  -- src/app/portal/(app)/governance/meetings/minutes-snapshot.ts; jsonb rather
  -- than columns because the list is as long as the tenant's template says.
  agenda_snapshot jsonb not null default '{}'::jsonb,
  -- Flat { <item key from agenda_snapshot.items>: text }. Merged with `||` by
  -- save_meeting_minutes_draft() below, never replaced wholesale.
  notes jsonb not null default '{}'::jsonb,
  -- General / closing notes: whatever belongs to the meeting rather than to one
  -- item. Seeded from agendas.body_text when the minutes are started.
  body_text text,
  -- text + check, never a Postgres enum -- the convention every status column
  -- in this schema follows.
  status text not null default 'draft' check (status in ('draft', 'final')),
  -- The notetaker putting the pen down. Deliberately NOT the same fact as
  -- governance_meetings.minutes_approved_at/by (20260831000000), which is the
  -- board approving these minutes at the NEXT meeting: two events, two column
  -- pairs. Collapsing them would give one fact two sources of truth, and the
  -- existing column stays where it is for the opening-checklist badge and for
  -- meetings that predate this table. Un-duplicating it is a follow-up.
  finalized_at timestamptz,
  finalized_by uuid references auth.users(id),
  -- The board's approval, mirrored here once approveMinutesAction writes it on
  -- the approving meeting, so a set of minutes can answer for itself.
  approved_at timestamptz,
  approved_by uuid references auth.users(id),
  approved_at_meeting_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id),
  unique (tenant_id, id),
  -- One set of minutes per meeting. The plain (tenant_id, meeting_id) unique is
  -- also what makes startMinutesFromAgenda idempotent by refusal: the second
  -- caller loses the race with a 23505 rather than writing a second snapshot.
  unique (tenant_id, meeting_id),
  -- Composite, like every other reference between two tenant tables
  -- (20260906080000). `set null (<column>)` rather than the bare form, which
  -- would try to null tenant_id too and fail its not-null constraint.
  foreign key (tenant_id, meeting_id)
    references public.governance_meetings (tenant_id, id) on delete cascade,
  foreign key (tenant_id, approved_at_meeting_id)
    references public.governance_meetings (tenant_id, id)
    on delete set null (approved_at_meeting_id),
  constraint meeting_minutes_final_state
    check ((status = 'final') = (finalized_at is not null))
);

comment on table public.meeting_minutes is
  'What happened at one meeting (#1199): a frozen ordered snapshot of the agenda, per-item notes keyed to it, and a draft -> final lifecycle. Not the `minutes` table #408 dropped, which was an external_link/body_text duplicate of the agenda.';
comment on column public.meeting_minutes.agenda_snapshot is
  'The agenda as it stood when the minutes were started: {version, meeting_date, template_id, template_version_id, external_link, items[]}. Each item is {key, label, kind, planned?}. Keys are assigned once, here, and never recomputed.';
comment on column public.meeting_minutes.notes is
  'Flat { item key -> text }, keyed to agenda_snapshot.items. Written only through save_meeting_minutes_draft(), which merges rather than replaces. Last-write-wins per key: two people typing in the same section still overwrite each other. No locking and no Realtime, by design.';
comment on column public.meeting_minutes.finalized_at is
  'When the notetaker finished writing. Not the board''s approval -- that is governance_meetings.minutes_approved_at, recorded at the next meeting.';

create index meeting_minutes_tenant_id_idx on public.meeting_minutes (tenant_id);
create index meeting_minutes_meeting_id_idx on public.meeting_minutes (meeting_id);

create trigger set_updated_at before update on public.meeting_minutes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Access
-- ---------------------------------------------------------------------------

alter table public.meeting_minutes enable row level security;

create policy "meeting_minutes select" on public.meeting_minutes for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('governance', 'view')
  );
create policy "meeting_minutes insert" on public.meeting_minutes for insert to authenticated
  with check (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('governance', 'manage')
  );
create policy "meeting_minutes update" on public.meeting_minutes for update to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('governance', 'manage')
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('governance', 'manage')
  );
create policy "meeting_minutes delete" on public.meeting_minutes for delete to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('governance', 'manage')
  );

grant select, insert, update, delete on public.meeting_minutes to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Finalized minutes are protected by a trigger, not by the policy
-- ---------------------------------------------------------------------------

-- The obvious `using (status = 'draft')` on the update policy would also block
-- reopening: at the moment somebody flips a set of minutes back to draft the
-- row is still `final`, so the policy would refuse the very statement that
-- unlocks it. A trigger can look at both tuples and tell the two apart.
--
-- The only legal write to a final row is therefore the status flip back to
-- draft, plus the approval columns -- the board approves minutes that are
-- final, and that must not require reopening them.
create function public.meeting_minutes_reject_final_edit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'final' and new.status = 'final' and (
    new.notes is distinct from old.notes
    or new.body_text is distinct from old.body_text
    or new.agenda_snapshot is distinct from old.agenda_snapshot
  ) then
    raise exception 'MINUTES_FINAL'
      using hint = 'Reopen these minutes before editing them.';
  end if;
  return new;
end;
$$;

comment on function public.meeting_minutes_reject_final_edit() is
  'Refuses a content edit to finalized minutes (#1199) while still allowing the reopen and the approval stamp, which a status predicate on the update policy could not.';

create trigger meeting_minutes_reject_final_edit
  before update on public.meeting_minutes
  for each row execute function public.meeting_minutes_reject_final_edit();

-- ---------------------------------------------------------------------------
-- 4. The merge an autosave needs
-- ---------------------------------------------------------------------------

-- `notes || p_notes` is a shallow jsonb concat, exactly right for a flat
-- { key: string } map: an autosave writes only the keys that changed and leaves
-- every other section alone. PostgREST cannot express that merge through
-- .update(), and a read-modify-write in the application loses writes whenever
-- two saves overlap -- which is routine once saving is debounced rather than
-- a button.
--
-- security INVOKER is the point. RLS still authorizes the caller through the
-- update policy above, so this function adds atomicity and nothing else; it
-- grants nobody anything they did not already have.
--
-- Zero rows back means "no draft row here" -- either the minutes were never
-- started, or they are final -- and the caller turns that into a conflict.
-- p_body_text_set distinguishes "leave the closing notes alone" from "the
-- notetaker cleared them", which a null p_body_text cannot say on its own.
create function public.save_meeting_minutes_draft(
  p_meeting_id uuid,
  p_notes jsonb,
  p_body_text text,
  p_body_text_set boolean
)
returns timestamptz
language sql
security invoker
set search_path = public
as $$
  update public.meeting_minutes
     set notes = notes || coalesce(p_notes, '{}'::jsonb),
         body_text = case when p_body_text_set then p_body_text else body_text end,
         updated_by = auth.uid()
   where meeting_id = p_meeting_id
     and status = 'draft'
  returning updated_at;
$$;

comment on function public.save_meeting_minutes_draft(uuid, jsonb, text, boolean) is
  'Merges an autosave into a draft set of minutes (#1199) and returns the new updated_at, or no row when the minutes are final or absent. security invoker: RLS authorizes, this only makes the merge atomic.';

revoke execute on function public.save_meeting_minutes_draft(uuid, jsonb, text, boolean) from public;
grant execute on function public.save_meeting_minutes_draft(uuid, jsonb, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Linking an action item to the minutes item it came from
-- ---------------------------------------------------------------------------

-- An action raised while discussing Finance & Fundraising should be recorded
-- against that section and render beneath it in the minutes and the export.
-- No foreign key: the key is a position in one meeting's frozen
-- agenda_snapshot.items, not a row anywhere. No index either -- the lists are
-- per-meeting and small, and every query that reads them already filters on
-- meeting_id.
alter table public.governance_meeting_action_items
  add column minutes_item_key text;

comment on column public.governance_meeting_action_items.minutes_item_key is
  'The meeting_minutes.agenda_snapshot item this action was raised under (#1199), e.g. "section:finance_fundraising". Null on items created from anywhere but the Minutes tab, and on everything created before this column existed.';
