-- Chatter Snow's public gear page stops calling itself a library.
--
-- "Library" says borrow-and-return. Chatter Snow's gear is donated, given
-- away and kept: nobody brings it back. So the collection's public name
-- becomes "Free Gear", and the copy that said "the library" says what the
-- program actually is.
--
-- Each row changes only while it still holds the exact words a migration put
-- there (20260908040000, 20260912030000). A slot or term somebody has since
-- edited from Administration is newer than this and is left alone, so on an
-- environment where the board has already reworded it -- or one with no
-- `chatter-snow` tenant -- this is a no-op.
--
-- Triggers off for the write, as in 20260908040000: `set_updated_at` would
-- stamp a null actor and `audit_log_row` would log a change no person made.

alter table public.app_settings
  disable trigger set_updated_at,
  disable trigger audit_log_row;

update public.app_settings s
set value = '"Free Gear"'::jsonb
from public.tenants t
where t.slug = 'chatter-snow'
  and s.tenant_id = t.id
  and s.key = 'lexicon.collection_public'
  and s.value = '"Gear Library"'::jsonb;

alter table public.app_settings
  enable trigger set_updated_at,
  enable trigger audit_log_row;

alter table public.site_content
  disable trigger set_updated_at,
  disable trigger audit_log_row;

update public.site_content s
set value = v.new_value::jsonb
from public.tenants t,
  (values
    ('gears.library_heading', '"Gear library"', '"Free Gear"'),
    ('gears.library_intro',
      '"Browse gear currently available to the community."',
      '"Donated ski and snowboard gear that''s free to take home and keep. Add what you need to your cart and send one request for everything."'),
    ('gears.donate_intro',
      '"Chatter collects donated ski and snowboard gear and makes it available to people in the community who need it. Browse the library, add what you need to your cart, and submit one request for everything at once. We''ll help coordinate pickup or drop-off at an upcoming event."',
      '"Chatter collects donated ski and snowboard gear and gives it, free, to people in the community who need it. It''s yours to keep. Browse the free gear, add what you need to your cart, and submit one request for everything at once. We''ll help coordinate pickup or drop-off at an upcoming event."'),
    ('gears.request_body',
      '"If your size or item isn''t currently in the library, send us a message and we''ll do our best to match you with available gear."',
      '"If your size or item isn''t available right now, send us a message and we''ll do our best to match you with gear."')
  ) as v(key, old_value, new_value)
where t.slug = 'chatter-snow'
  and s.tenant_id = t.id
  and s.key = v.key
  and s.value = v.old_value::jsonb;

alter table public.site_content
  enable trigger set_updated_at,
  enable trigger audit_log_row;
