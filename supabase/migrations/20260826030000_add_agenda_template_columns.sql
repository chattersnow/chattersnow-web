-- Extends agendas with the structured board meeting agenda template's
-- per-meeting content (issue #166): a pinned template/version (so a saved
-- agenda keeps rendering the sections it was built from even if the
-- template is revised later, mirroring content_opportunities' template_id/
-- template_version_id/template_field_values), the ongoing board items'
-- per-section free text, and the remaining flat sections that don't have a
-- dedicated table (new business, parking lot, upcoming dates, next
-- meeting). "Action Items From Previous Meeting"/"Action Items Created
-- Today" and "Decisions & Votes" reuse the existing
-- governance_meeting_action_items/governance_meeting_decisions tables
-- instead of duplicating that data here.

alter table public.agendas
  add column template_id uuid references public.agenda_templates(id),
  add column template_version_id uuid references public.agenda_template_versions(id),
  add column ongoing_items jsonb not null default '{}'::jsonb,
  add column new_business jsonb not null default '[]'::jsonb,
  add column parking_lot jsonb not null default '[]'::jsonb,
  add column upcoming_dates jsonb not null default '[]'::jsonb,
  add column next_meeting_date date,
  add column next_meeting_topics text;
