-- A simple, item-list agenda for non-board meetings (#1623, part of #1621).
--
-- Only `board` meetings get the structured, template-driven agenda. A
-- committee, annual or other meeting gets an ordered list of items, each a
-- title and optional notes, and its minutes follow those items.
--
-- `format` records which shape a row was written in, rather than deriving it
-- from the meeting's type: the type can change after the agenda is written,
-- and the agenda then has to keep rendering in the shape it was written in
-- (read-only) instead of being reinterpreted. Every existing row is a board
-- agenda, which is what the default says, so nothing is back-filled.
--
-- `items` is jsonb `[{id, title, notes?}]` beside the board columns rather than
-- a child table: the whole agenda is saved in one upsert from one form, the
-- board columns are jsonb read through the same hand-written guards, and an
-- item's `id` is stable so minutes notes can be keyed `item:<id>` to it.
--
-- No new policies: both columns are read and written under the existing
-- agendas policies.

alter table public.agendas
  add column format text not null default 'board',
  add column items jsonb not null default '[]'::jsonb,
  add constraint agendas_format_check check (format in ('board', 'simple')),
  add constraint agendas_items_is_array check (jsonb_typeof(items) = 'array');

comment on column public.agendas.format is
  'Which agenda shape this row was written in (#1623): board (template sections and the standing lists) or simple (items). Fixed at first save; a meeting whose type later changes keeps its agenda read-only in this shape.';
comment on column public.agendas.items is
  'A simple agenda''s ordered items (#1623): [{id, title, notes?}]. Ids are stable; minutes notes are keyed item:<id>.';
