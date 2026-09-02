-- Sensitive-topic flag + reviewer sign-off (issue #113 scope item 2). Lives
-- on calendar_items rather than content_opportunities because it's a
-- property of the moment itself (e.g. Transgender Day of Remembrance is
-- sensitive regardless of whether content has even been planned yet), and
-- the sign-off is a distinct gate from the content-opportunity approval
-- step tracked by content_opportunities.status_changed_by/at.
--
-- All four columns are internal-only: public_calendar_items already
-- selects an explicit column list (see 20260824000000/20260824030000), so
-- these are excluded from the public view automatically.

alter table public.calendar_items
  add column is_sensitive_topic boolean not null default false,
  add column tone_guidance text,
  add column sensitive_review_by uuid references auth.users(id),
  add column sensitive_review_at timestamptz,
  add constraint calendar_items_sensitive_review_pair_check
    check ((sensitive_review_by is null) = (sensitive_review_at is null));

comment on column public.calendar_items.is_sensitive_topic is
  'Flags a moment (e.g. HIV/AIDS remembrance, Transgender Day of Remembrance) as requiring human reviewer sign-off, distinct from normal content approval, before its content opportunity can be approved/scheduled/published.';
comment on column public.calendar_items.tone_guidance is
  'Tone guidance for staff writing content about this moment, surfaced in the content brief editor. Internal only.';
comment on column public.calendar_items.sensitive_review_by is
  'Who signed off on this sensitive-topic moment''s tone/handling. Distinct from content_opportunities.status_changed_by, which tracks ordinary content-status transitions.';
comment on column public.calendar_items.sensitive_review_at is
  'When the sensitive-topic sign-off was recorded.';

-- calendar_items is already on the audit_log trigger (20260824000100), so
-- these new columns are captured automatically -- no audit migration needed.
