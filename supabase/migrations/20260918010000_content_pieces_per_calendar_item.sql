-- One calendar item, many content pieces (#1231).
--
-- The brief was one-to-one with a calendar item and asked for a structured
-- answer to questions the team does not yet know how to ask: recommended
-- formats, recommended action/CTA, outstanding work, the organization's
-- connection. In practice one moment produces several posts or stories, and
-- what is actually useful is a short list of those pieces, each with a plan
-- and one free-text area to think in.
--
-- The table keeps its name so the existing `audit_log` history, the RLS
-- policies and the `audited_tables` registry entry carry over untouched; the
-- portal calls these rows **content pieces**.

-- 1. Many per item. Two constraints enforced the one-to-one: the original
-- column-level unique from 20260824070000, and the mirrored
-- (tenant_id, calendar_item_id) unique that 20260906080000 added so PostgREST
-- would keep embedding the brief as an object rather than an array. Both go --
-- and dropping the second is exactly what turns
-- `calendar_items(..., content_opportunities(...))` into the array the portal
-- now reads. The composite foreign key and its `on delete cascade` stay: a key
-- needs a unique on the *parent*, which calendar_items still has.
alter table public.content_opportunities
  drop constraint content_opportunities_calendar_item_id_key,
  drop constraint content_opportunities_tenant_calendar_item_id_key;

-- Those two constraints were also the only index on the column every read of
-- this table filters by. Replaced with a plain one, tenant-first to match the
-- foreign key and the RLS predicate.
create index content_opportunities_tenant_calendar_item_idx
  on public.content_opportunities (tenant_id, calendar_item_id);

-- 2. The two new columns. `title` so a list of three pieces on one item is
-- readable, `content` as the single free-text area that replaces the four
-- prose fields below.
alter table public.content_opportunities
  add column title text,
  add column content text;

-- 3. Backfill, before `title` becomes required and before the prose columns
-- are dropped -- nothing already typed is lost. User triggers are disabled for
-- the same reason the Phase 2 tenant backfill disabled them
-- (20260906010000): this is a schema migration, not an edit anyone made, and
-- it should neither flood `audit_log` with one row per brief nor restamp
-- `updated_at`.
alter table public.content_opportunities disable trigger user;

update public.content_opportunities co
set
  title = ci.title,
  content = nullif(
    concat_ws(
      E'\n\n',
      case when nullif(btrim(coalesce(co.org_connection, '')), '') is not null
        then 'Our connection: ' || btrim(co.org_connection) end,
      case when nullif(btrim(coalesce(co.recommended_formats, '')), '') is not null
        then 'Recommended formats/channels: ' || btrim(co.recommended_formats) end,
      case when nullif(btrim(coalesce(co.recommended_action, '')), '') is not null
        then 'Recommended action / CTA: ' || btrim(co.recommended_action) end,
      case when nullif(btrim(coalesce(co.outstanding_work, '')), '') is not null
        then 'Outstanding work: ' || btrim(co.outstanding_work) end
    ),
    ''
  )
from public.calendar_items ci
where ci.id = co.calendar_item_id;

alter table public.content_opportunities enable trigger user;

alter table public.content_opportunities
  alter column title set not null,
  add constraint content_opportunities_title_not_blank check (btrim(title) <> '');

-- 4. The prose fields the single `content` area replaces. `skip_reason`,
-- `internal_notes` and the whole scheduling half of the row stay.
alter table public.content_opportunities
  drop column org_connection,
  drop column recommended_formats,
  drop column recommended_action,
  drop column outstanding_work;

comment on table public.content_opportunities is
  'Content pieces: the posts, stories and other publications planned for a calendar item. Many per item since #1231 (it was one brief per item before that); the table keeps its original name so its audit history and RLS carry over.';

comment on column public.content_opportunities.title is
  'What this piece is, in a few words -- what makes a list of several pieces on one calendar item readable.';

comment on column public.content_opportunities.content is
  'The one free-text area for this piece: the angle, the channels, the call to action, what is still outstanding -- whatever order the person planning it thinks in. Replaced org_connection, recommended_formats, recommended_action and outstanding_work in #1231, whose contents were concatenated into it as labelled paragraphs.';

-- #1230 had just reworded this to "content briefs"; a brief is a piece now.
update public.modules
set description = 'The content calendar, its categories and the content pieces planned for each item.'
where key = 'calendar';
