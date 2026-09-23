-- #1407: Chatter Snow's default registration question.
--
-- Every new Chatter Snow event starts by asking each person in the party
-- whether they bring their own equipment, need a lift ticket, or need a ticket
-- and gear. Uncapped by default: caps are per event (how many sponsor tickets
-- or gear sets there are this time) and are set on the event's Planning tab.
--
-- Scoped by `tenants.slug = 'chatter-snow'`, so on a database with no such
-- tenant -- local and CI, which bootstrap as `example-nonprofit` -- this is a
-- clean no-op and every event there keeps asking nothing. `on conflict do
-- nothing`, so a value the tenant has already set wins. Existing events are
-- untouched: the defaults apply from the next event created.
--
-- Triggers off for the write, as 20260923010000 does: set_updated_at would
-- stamp a null actor, and audit_log_row would record a change no person made.

alter table public.app_settings
  disable trigger set_updated_at,
  disable trigger audit_log_row;

insert into public.app_settings (tenant_id, key, value)
select t.id, 'events.registration_option_defaults', jsonb_build_object(
  'prompt', 'What does each person need?',
  'options', jsonb_build_array(
    jsonb_build_object('label', 'I don''t need a ticket, I''ll use my own', 'cap', null),
    jsonb_build_object('label', 'I need a ticket', 'cap', null),
    jsonb_build_object('label', 'I need a ticket and gear', 'cap', null)
  )
)
from public.tenants t
where t.slug = 'chatter-snow'
on conflict (tenant_id, key) do nothing;

alter table public.app_settings
  enable trigger set_updated_at,
  enable trigger audit_log_row;
