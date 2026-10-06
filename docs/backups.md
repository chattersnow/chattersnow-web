# Database backups

**Updated:** 2026-10-06

How the hosted Supabase database is backed up and how to restore it.

## What exists

The Supabase project is on the **Pro plan**, which backs the database up
automatically once a day and keeps the **last 7 days** of those backups. They
are listed, and restored from, in the dashboard under **Database → Backups**.
Nothing in this repository takes part.

Point-in-time recovery is a paid add-on on top of Pro (and needs at least the
Small compute add-on). It is not enabled, so the worst case is losing up to a
day of writes back to the most recent daily backup.

Deleting the Supabase project deletes its backups with it. That is the one
failure these backups do not cover.

### What this replaced

Until 2026-10-06, `.github/workflows/db-backup.yml` was meant to dump the
database nightly, encrypt it with `age`, and upload it to Cloudflare R2, because
the Free plan has no backups of its own. It never completed a run — every
scheduled run failed before uploading anything — so no R2 backup was ever
written. It was removed once the project moved to Pro.

## Retention and the privacy policy

The published privacy policy (`src/lib/legal-defaults.ts`) says deleted
information may persist in a backup for up to 7 days. That number is
Supabase's Pro retention, not a setting here. **If the plan changes, the policy
changes with it**: Team keeps 14 days, Enterprise up to 30, and Free keeps none.

## Restoring

Restoring from the dashboard replaces the live database in place and takes the
project offline while it runs. Before doing it:

1. Take a manual dump (below), so the restore itself can be undone.
2. Check the backup's timestamp in **Database → Backups** is the one you mean.
3. Restore, then compare row counts for a few tables you know — `people`,
   `events`, `inventory_items`, `donations` — against what you expected. A
   restore that completes but brings back a third of the rows has failed
   silently.

## Manual backup

Before anything risky — a destructive migration, a bulk edit — take one by hand
rather than trusting last night's:

```
supabase db dump --linked -f supabase/backups/$(date +%Y%m%d-%H%M%S)-schema.sql
supabase db dump --linked --data-only -f supabase/backups/$(date +%Y%m%d-%H%M%S)-data.sql
```

`supabase/backups/` is gitignored and must stay that way — those files are
unencrypted and contain live personal data.
