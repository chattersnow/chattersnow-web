-- #824 removed the item type and category badges from the public community
-- calendar, which makes the page's own intro copy false: it promises
-- "Chatter-hosted events are marked as such", and after #824 nothing marks
-- them. The disclaimer the sentence exists to carry -- that not everything
-- listed is a Chatter event -- still has to survive, so the copy is reworded
-- rather than dropped.
--
-- 20260908040000 seeded this slot for the chatter-snow tenant, so changing the
-- default in src/lib/site-content.ts is not enough on its own: the seeded row
-- wins. The update is guarded on the value still being exactly what that
-- migration wrote, because a slot someone has since edited from
-- Administration > Site Content is newer than any default and must not be
-- overwritten. On an environment with no chatter-snow tenant, or one where the
-- copy was already edited, this is a no-op.
--
-- Triggers are disabled for the same reason 20260908040000 disables them: this
-- is a default correcting itself, not a person editing content, so it should
-- not be stamped with a null actor or written to the audit log.

alter table public.site_content
  disable trigger set_updated_at,
  disable trigger audit_log_row;

update public.site_content as sc
set value = to_jsonb(
      'Community observances, seasonal moments, campaigns, and Chatter''s own events, all in one place. Not everything listed here is hosted or organized by Chatter.'::text
    ),
    published_at = now()
from public.tenants as t
where sc.tenant_id = t.id
  and t.slug = 'chatter-snow'
  and sc.key = 'events.community_intro'
  and sc.value = to_jsonb(
        'Chatter-hosted events are marked as such. Other entries are community observances, seasonal moments, and campaigns Chatter is highlighting — not events Chatter hosts or organizes.'::text
      );

alter table public.site_content
  enable trigger set_updated_at,
  enable trigger audit_log_row;
