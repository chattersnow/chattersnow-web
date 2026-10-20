-- #1620: Chatter Snow's own `events.media_upload_rights` paragraphs.
--
-- The slot ships blank on every tenant (src/lib/site-content.ts): what an
-- organization does with a photographer's uploads is its own to say, and the
-- upload page asks the uploader to agree to these words. Seeded for Chatter
-- Snow in the same change, as #599 and #685 did for their slots.
--
-- Nothing here is new commitment. Each sentence restates what Chatter Snow
-- already publishes as its own:
--
--   - "our own newsletters, on this site, and on our social media accounts"
--     and "we do not sell photos and we do not pass them to anyone else to
--     use" -- `events.photo_consent` paragraph 1 (20260922090000);
--   - "You keep ownership of anything you send us ... permission to use,
--     store, and share it as far as we reasonably need" -- `legal.terms`,
--     `photos-and-content` (20260909020000);
--   - the takedown promise and the info@chattersnow.org address -- the same
--     section and `events.photo_consent` paragraph 2 (20260923030000).
--
-- No credit line is promised: nothing Chatter Snow publishes says how it
-- credits a photographer, so that is left for the board to add. Ratification
-- may still be open; the wording is up for sign-off in the pull request.
--
-- The idiom is 20260922090000's: scoped by `tenants.slug = 'chatter-snow'`, so
-- the demo and platform tenants inherit nothing and a fresh local or CI
-- database (bootstrapped as `example-nonprofit`) is a clean no-op that keeps
-- exercising the blank slot; `on conflict do nothing`, so an edit made before
-- this runs wins; `set_updated_at` and `audit_log_row` off around the write.

alter table public.site_content
  disable trigger set_updated_at,
  disable trigger audit_log_row;

with tenant as (
  select id from public.tenants where slug = 'chatter-snow'
)
insert into public.site_content (tenant_id, key, value, published_at)
select tenant.id, v.key, v.value::jsonb, now()
from tenant, (values
  ('events.media_upload_rights', '["You keep ownership of the photos and videos you upload here. Uploading them gives Chatter Snow permission to keep them with this event and to use them in our own newsletters, on our site, and on our social media accounts. That is the whole of it — we do not sell them and we do not pass them to anyone else to use.","If someone in a photo asks us to take it down, we will, as we promise everyone at our events. If you would rather we stopped using something you sent, email info@chattersnow.org."]')
) as v(key, value)
on conflict (tenant_id, key) do nothing;

alter table public.site_content
  enable trigger set_updated_at,
  enable trigger audit_log_row;
