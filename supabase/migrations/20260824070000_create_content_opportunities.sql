-- Content-opportunity brief per calendar item (spec §5.20/§6, issue #106).
-- One-to-one with calendar_items (calendar_item_id is unique): a separate
-- record from the calendar item's own calendar_status/decision, since
-- planning a moment and producing content for it are separate concerns.
--
-- Status history: this migration intentionally does NOT wire
-- content_opportunities into the audit_log trigger. Issue #109 ("extend
-- audit log to calendar items and content-opportunity workflow") lists this
-- issue as a dependency, so full multi-transition history is that ticket's
-- job -- this table only tracks the actor/timestamp of the *last* status
-- change (status_changed_by/status_changed_at), same as calendar_items'
-- plain updated_by/updated_at.

create table public.content_opportunities (
  id uuid primary key default gen_random_uuid(),
  calendar_item_id uuid not null unique references public.calendar_items(id) on delete cascade,
  content_status text not null default 'not_planned' check (content_status in (
    'not_planned', 'idea', 'draft', 'in_review', 'changes_requested',
    'approved', 'scheduled', 'published', 'skipped'
  )),
  skip_reason text,
  chatter_connection text,
  recommended_formats text,
  recommended_action text,
  outstanding_work text,
  owner_id uuid references auth.users(id),
  reviewer_id uuid references auth.users(id),
  lead_time_days integer not null default 21 check (lead_time_days > 0),
  publish_due_at timestamptz,
  review_due_at timestamptz,
  draft_due_at timestamptz,
  status_changed_by uuid references auth.users(id),
  status_changed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id),
  check (content_status <> 'skipped' or skip_reason is not null)
);

create trigger set_updated_at before update on public.content_opportunities
  for each row execute function public.set_updated_at();

alter table public.content_opportunities enable row level security;

-- Same content_calendar resource as calendar_items -- a brief is just a
-- linked part of the calendar item, not a separately-permissioned surface.
create policy "content_opportunities select" on public.content_opportunities for select to authenticated
  using (public.has_permission('content_calendar', 'view'));
create policy "content_opportunities insert" on public.content_opportunities for insert to authenticated
  with check (public.has_permission('content_calendar', 'manage'));
create policy "content_opportunities update" on public.content_opportunities for update to authenticated
  using (public.has_permission('content_calendar', 'manage')) with check (public.has_permission('content_calendar', 'manage'));
create policy "content_opportunities delete" on public.content_opportunities for delete to authenticated
  using (public.has_permission('content_calendar', 'manage'));
grant select, insert, update, delete on public.content_opportunities to authenticated;

-- Org-wide default lead time (days), read/written through the existing
-- generic app_settings store (see 20260823040000_create_app_settings.sql)
-- rather than hardcoding it in application code.
insert into public.app_settings (key, value) values
  ('content.default_lead_time_days', to_jsonb(21));

-- app_settings' select policy only let system_settings/event_expenses
-- managers read values (each added as the settings store gained a new
-- consumer with its own job-specific need to read a value -- see that
-- migration's comment). event_coordinator, the role that actually manages
-- calendar items, needs to read the lead-time default to do their job, the
-- same reasoning that got event_expenses added; extend the same policy
-- rather than adding a parallel one.
drop policy "app_settings select" on public.app_settings;
create policy "app_settings select" on public.app_settings for select to authenticated
  using (
    public.has_permission('system_settings', 'manage')
    or public.has_permission('event_expenses', 'manage')
    or public.has_permission('content_calendar', 'manage')
  );
