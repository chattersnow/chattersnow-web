# Governance — specification

Part of [`docs/technical-spec.md`](../technical-spec.md) — section numbers are
unchanged. This file holds §5.12 and the governance data model. Technology, system boundaries, security, the
route tree and the key workflows stay in the hub. A plain `§N` below is in this
file; a `§N` that lives in another file is always a link.

**Also relevant:** `board` is the second approver above the finance threshold — see [§5.16](finance.md#516-financial-controls-and-approval-workflow).

## 5.12 Governance

Authorized users shall be able to manage nonprofit governance records:

- **Board members**: linked to `people`, with role/title, term start/end, and active status.
- **Meetings**: date, type (board, committee, annual, other), facilitator and notes-taker (both `people`), attendees, and associated:
  - **Agendas**: for board meetings, built from a versioned, seeded agenda template (issue #166) covering the standing "Ongoing Board Items" review sections (Finance & Fundraising, Legal & Nonprofit, Events, Community & Partnerships, Marketing & Social, Operations, Technology & Website — each with fixed discussion topics plus per-meeting updates/decisions-needed text), new business, upcoming dates, a parking lot, and next-meeting info, alongside the meeting's action items and decisions/votes.
  - **Minutes**
  - **Action items** and **decisions**: list-based, per meeting; decisions carry an optional topic and vote result alongside the discussion description, so a decision can double as a lightweight "Decisions & Votes" agenda entry.
  - **Resolutions**: motion text, mover/seconder, vote outcome, and effective date
- **Bylaws**: the governing document, with effective date and amendment history.
- **Policies**: named policies (e.g. whistleblower, document retention, conflict of interest policy itself), each with a category and effective date.
- **Conflict of interest**: per-person annual disclosure statements, on-file date, and any noted conflicts.
- **Annual requirements**: recurring compliance items (e.g. annual report, IRS Form 990, state charitable registration renewal) with due date, completion status/date, and responsible party.
- **Nonprofit status tracking**: a phased checklist tracking progress toward 501(c)(3) formation, grouped by the roadmap's Gate/Phase labels, with each item carrying a status (not started / in progress / done), an optional owner (`people`), and an optional due date. Entries are updated manually by admin/board — these are real-world legal filings with no transactional trigger elsewhere in the portal. Not a weighted percent-complete meter; a derived "N of M complete" count is shown per phase and overall instead. Portal-only, gated on the same `governance` resource as other governance records (issues #145/#146).

The content of an individual governance record (a policy's text, a set of minutes, a signed bylaws amendment, etc.) is not required to take one fixed form. A record may hold an external link (e.g. to a file in the organization's Google Drive/OneDrive), a free-text body, or both, so staff can start with a quick note and add a link to the scanned/signed file once it exists. **There is no in-app file upload option, by permanent design** (see [§2](../technical-spec.md#2-goals-and-non-goals)) — `minutes` is implemented this way (`external_link`/`body_text` columns only, no `file_attachment_id`), and `bylaws`, `policies`, `conflict_of_interest_disclosures`, and `annual_requirements` will follow the same pattern once built; `agendas` keeps the same `external_link` field but replaced its single free-text body with the structured, template-driven columns described above (issue #166), pinned to the template version an agenda was built from so later template revisions don't retroactively change a saved agenda. A `file_attachments` table is not planned — see [§2](../technical-spec.md#2-goals-and-non-goals) and [§6](../technical-spec.md#6-proposed-data-model).

Governance records contain sensitive organizational and personal information and must not be public. Access is limited to the `admin` and `board` roles — see the entitlement matrix in [§5.3](access-control.md#53-authentication-and-authorization).

Governance (board members, meetings/agendas/minutes/action items/decisions, resolutions, bylaws, policies, conflict-of-interest disclosures, annual requirements, nonprofit-status tracking) is fully implemented, not a placeholder.

## 6. Data model — Governance

Meetings, agendas, minutes, action items, decisions, board members, nonprofit-status tracking, bylaws, policies, conflict-of-interest disclosures, and annual requirements are all implemented.

- `board_members`: links a `people` record with role/title, term start/end, and active status. `bylaws.md` Article VI's Board/Advisory Committees concept (issue #12) is deliberately out of scope for this data model for now — no `committees` entity exists, and committee membership is not tracked here.
- `governance_meetings`: date, type (board, committee, annual, other), status, `facilitator_person_id`/`notetaker_person_id` (both → `people`, issue #166); associated `governance_meeting_attendees` link table to `people`
- `agendas`: linked to a `governance_meetings` row (unique). `external_link` plus a structured, template-driven body (issue #166): `template_id`/`template_version_id` (pinned at save time, → `agenda_templates`/`agenda_template_versions`), `ongoing_items` (jsonb, keyed by template section, holding per-meeting updates/decisions-needed text), `new_business`/`parking_lot` (jsonb string arrays), `upcoming_dates` (jsonb array of date/description/owner), `next_meeting_date`/`next_meeting_topics`, and `body_text` (repurposed as free-form meeting notes).
- `agenda_templates` / `agenda_template_versions`: a small versioned catalog (issue #166), mirroring `content_brief_templates`/`content_brief_template_versions` below — a template's `current_version_id` points at its live `sections` (each `{key, label, topics}`, one per standing "Ongoing Board Items" subsection); revising a template inserts a new version rather than mutating one an existing agenda is pinned to. Seeded with a single `board_meeting` template covering the seven standard sections.
- `minutes`: linked to a `governance_meetings` row
- `governance_meeting_action_items`: linked to a `governance_meetings` row, description, owner (`people`), due date, status (open/done)
- `governance_meeting_decisions`: linked to a `governance_meetings` row, description (the discussion), decision date, and optional `topic`/`vote_result` (issue #166) so a decision can serve as an agenda's "Decisions & Votes" entry — distinct from `resolutions` below, which are formal motions
- `resolutions`: linked to a `governance_meetings` row (optional), motion text, mover/seconder (`people`), vote outcome, effective date
- `bylaws`: **implemented** (issue #38) — `version`, `effective_date`, `amendment_summary`. Each amendment is its own row rather than mutating a shared "current" record, per the app's records-with-history philosophy ([§2](../technical-spec.md#2-goals-and-non-goals) goal 4); the row with the latest `effective_date` is the current bylaws, and the full row list is the amendment history — no separate history table. `/portal/governance/bylaws` shows the current version plus a history table of prior versions.
- `policies`: **implemented** (issue #38) — `name`, `category` (free text — spec gives examples, no fixed taxonomy), `effective_date`, `version`. Same one-row-per-revision approach as `bylaws`. `/portal/governance/policies` is a searchable/filterable list.
- `conflict_of_interest_disclosures`: **implemented** (issue #39) — linked to a `people` record, `disclosure_year`, `on_file_date`, `notes`, unique per person/year.
- `annual_requirements`: **implemented** (issue #39) — `name`, `due_date`, `status` (not_started/in_progress/done), `completed_at` (derived from status transitions in app logic), responsible `people` record.
- `nonprofit_status_milestones`: **implemented** (issues #145/#146, #356) — `description`, `phase`, optional `owner_person_id` (→ `people`), `due_date`, `status` (not_started/in_progress/done/cancelled), `sort_order` (stable row order within a phase, since seeded rows share one `created_at`), optional free-text `notes`. A plain checklist (no percent-complete meter, by design), seeded from `planning/governance/NONPROFIT_FORMATION.md`'s Phase 1–5 checklist, gated by the existing `governance` resource (no new resource needed) at `/portal/governance/nonprofit-status`.

`minutes`, `resolutions`, `bylaws`, `policies`, `conflict_of_interest_disclosures`, and `annual_requirements` each hold their substantive content via nullable `external_link` and `body_text` columns, populated in either or both, per §5.12. `minutes` is already built this way; `agendas` moved to the structured, template-driven column set described above. There is no `file_attachment_id` column and none is planned — `file_attachments` is not being built (see [§2](../technical-spec.md#2-goals-and-non-goals)).
