-- The platform tenant's "Security and your data" article described a backup
-- that never existed. 20260920040000 published "a backup is taken nightly,
-- encrypted before it leaves the machine that makes it, and held in Cloudflare
-- object storage for ninety days", after `.github/workflows/db-backup.yml`.
-- That workflow never completed a run, and Supabase is now on the Pro plan,
-- whose own daily backups (seven days kept) are what actually exists, so the
-- workflow is removed in the same change and the article says what is true.
--
-- Guarded the established way: the update matches only where the list item
-- still carries exactly the text 20260920040000 wrote, so an edit made from
-- Website > Learn since then wins over this migration. A pending draft is left
-- alone.
--
-- Triggers off for the write, per 20260920040000: there is no session in a
-- migration, so `set_updated_at` would stamp a null actor and `audit_log_row`
-- would write an actorless entry. `stamp_article_authorship` stays on -- it is
-- what moves `published_at`.

alter table public.articles
  disable trigger set_updated_at,
  disable trigger audit_log_row;

with target as (
  select a.id, (item.ordinality - 1)::text as item_index
  from public.articles as a
  join public.tenants as t on t.id = a.tenant_id
  cross join lateral jsonb_array_elements(a.value -> 'list')
    with ordinality as item(value, ordinality)
  where t.plan = 'internal'
    and a.anchor = 'security-and-data'
    and item.value ->> 'text' = $old$The application runs on Vercel in Washington, D.C. and the database is Postgres hosted by Supabase in Ohio. A backup is taken nightly, encrypted before it leaves the machine that makes it, and held in Cloudflare object storage for ninety days. That last number has a consequence worth stating plainly: something you delete can survive in an encrypted backup for up to ninety days after it is gone from the system.$old$
)
update public.articles as a
set value = jsonb_set(
  a.value,
  array['list', target.item_index, 'text'],
  to_jsonb($new$The application runs on Vercel in Washington, D.C. and the database is Postgres hosted by Supabase in Ohio. Supabase takes a backup of it daily and keeps each one for seven days. That number has a consequence worth stating plainly: something you delete can survive in a backup for up to seven days after it is gone from the system.$new$::text)
)
from target
where a.id = target.id;

alter table public.articles
  enable trigger set_updated_at,
  enable trigger audit_log_row;
