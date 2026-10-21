-- A governance meeting can be linked to one event (#1622, part of #1621):
-- a committee meeting planning an event, say. Optional, and allowed on any
-- meeting type.
--
-- The key is (tenant_id, event_id) -> events (tenant_id, id), the composite
-- form every tenant-to-tenant key takes since 20260906080000, so a meeting
-- cannot point at another tenant's event whatever writes it. Deleting the
-- event clears the link and keeps the meeting; `set null (event_id)` nulls
-- only that column, where the bare form would try to null tenant_id too.
--
-- No new policies: the column is read and written under the existing
-- governance_meetings policies, and the event side lists only the meetings
-- those policies already let the viewer select.

alter table public.governance_meetings
  add column event_id uuid,
  add constraint governance_meetings_event_id_fkey
    foreign key (tenant_id, event_id)
    references public.events (tenant_id, id)
    on delete set null (event_id);

create index governance_meetings_event_id_idx
  on public.governance_meetings (event_id)
  where event_id is not null;

comment on column public.governance_meetings.event_id is
  'The event this meeting is about, if any (#1622). Same-tenant by the composite foreign key; cleared when the event is deleted.';
