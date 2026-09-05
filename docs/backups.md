# Database backups

**Updated:** 2026-09-05

How the hosted Supabase database is backed up, how to restore it, and how the
encryption key is handled.

## What exists

`.github/workflows/db-backup.yml` runs nightly at 09:00 UTC and on demand. Each
run dumps the schema, the data, and the database roles, verifies the dumps are
not empty, encrypts them into a single archive, and uploads that to Cloudflare
R2.

**On the free plan this is the only backup.** Supabase's automated daily backups
and point-in-time recovery are paid features, so nothing else is capturing this
database. If this workflow is red, there is no backup newer than its last green
run. That is why a failed scheduled run opens an issue instead of relying on
email.

**The schedule only starts once this file is on `main`.** GitHub runs `schedule:`
triggers from the default branch only, and the "Run workflow" button for
`workflow_dispatch` appears only once the workflow exists there too. Merging to
`development` alone changes nothing — the nightly backup begins at the next
release to `main`.

## Why not Actions artifacts

This repository is public, and artifacts on a public repository can be
downloaded by anyone with the run URL — no authentication. The data dump holds
donor, participant, and volunteer records across 65 tables. It cannot be an
artifact, and it cannot be committed. The archive leaves the runner encrypted
and goes only to R2.

## Encryption

Backups are encrypted with [age](https://github.com/FiloSottile/age) using an
asymmetric keypair:

- The **public key** lives in the repository variable `BACKUP_AGE_PUBLIC_KEY`.
  It can only encrypt, so it is not sensitive.
- The **private key** lives offline, in a password manager. **It must never be
  added as a GitHub secret.** The entire point is that compromising this
  repository or its secrets yields ciphertext and nothing that opens it. Storing
  both halves in GitHub would make the encryption decorative.

Keep the private key somewhere at least two people can reach in an emergency.
An unopenable backup is not a backup, and the person holding the only copy of
the key is a single point of failure in exactly the situation backups exist for.

### Generating the keypair

```
age-keygen -o chattersnow-backup.key
```

The output file contains the private key; put it in the password manager and
delete the local copy. The line beginning `# public key:` is what goes into
`BACKUP_AGE_PUBLIC_KEY`.

## Retention

Expiry is enforced by a **lifecycle rule on the R2 bucket**, not by the
workflow, so it applies to every object regardless of how it arrived.

**Window: 90 days.**

Storage is not the constraint. Measured on the 2026-09-05 dump, one encrypted
archive is about 180 KB, so 90 days of nightly backups is roughly 16 MB against
R2's 10 GB free allowance. The window is set by the privacy commitment below,
not by cost.

This is a privacy commitment as much as housekeeping. The published retention
policy (planning repository,
`decisions/2026-09-02-personal-data-retention-and-privacy-policy.md`) promises
deletion of personal data on fixed schedules — contact messages at 2 years,
volunteer applications at 2 years, event registrations at 3 years, rider
profiles on request. A backup is a second copy that outlives those deletions, so
the window has to be bounded and stated. The privacy policy should say that
deleted data may persist in encrypted backups for up to 90 days.

This is also why backups are not kept in a git repository, private or otherwise:
git history cannot expire, so purging one person's records would mean rewriting
every commit that ever contained them.

## Configuration

Set once, in repository settings.

### The `Backups` environment

`SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` are **environment** secrets
on `Production`, not repository secrets. A job that declares no environment
receives them as empty strings and fails with "Access token not provided", so
this workflow has to name an environment to see them.

It cannot be `Production`, because that environment requires a reviewer and a
nightly backup waiting on manual approval is a backup that does not happen. So:

1. Settings → Environments → **New environment**, named `Backups`.
2. Leave protection rules empty — no required reviewers, no wait timer.
   Everything this job does is read-only against the database.
3. Add all five secrets below to it.

**Secrets** (Settings → Environments → `Backups` → Environment secrets):

| Name                    | Value                                                                |
| ----------------------- | -------------------------------------------------------------------- |
| `SUPABASE_ACCESS_TOKEN` | Same value as on `Production`                                        |
| `SUPABASE_DB_PASSWORD`  | Same value as on `Production`                                        |
| `R2_ACCOUNT_ID`         | Cloudflare account id — a secret here so it stays out of public logs |
| `R2_ACCESS_KEY_ID`      | R2 API token key id                                                  |
| `R2_SECRET_ACCESS_KEY`  | R2 API token secret                                                  |

**Variables** (Settings → Secrets and variables → Actions → Variables):

| Name                    | Value                                   |
| ----------------------- | --------------------------------------- |
| `BACKUP_AGE_PUBLIC_KEY` | The `age1...` public key                |
| `BACKUP_R2_BUCKET`      | Bucket name, e.g. `chattersnow-backups` |

**On the R2 side:** create the bucket, scope the API token to that bucket with
object read/write only, and add the 90-day lifecycle rule. Give the token no
broader access than it needs — it lives in a public repository's secret store.

## Restoring

Work through this on a scratch database first. A restore procedure nobody has
run is a hypothesis.

**1. Fetch and decrypt.**

```
aws s3 cp "s3://$BUCKET/db/2026/09/<stamp>.tar.gz.age" . \
  --endpoint-url "https://$ACCOUNT_ID.r2.cloudflarestorage.com"

age -d -i chattersnow-backup.key -o backup.tar.gz <stamp>.tar.gz.age
tar xzf backup.tar.gz
```

You now have `schema.sql`, `data.sql`, and `roles.sql`.

**2. Restore into a local database to verify.**

```
supabase start
psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" -f schema.sql
psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" -f data.sql
```

`data.sql` is a `--data-only` dump, so foreign keys are not ordered for a clean
insert. If it fails on constraint ordering, restore with triggers disabled:

```
psql "$DB_URL" -c 'set session_replication_role = replica;' -f data.sql
```

**3. Check it is actually the database you expected.** Compare row counts
against production for a few tables you know — `people`, `events`,
`inventory_items`, `donations`. A restore that completes without error but
brings back a third of the rows has failed silently.

**4. Only then consider restoring to a hosted project**, and prefer restoring
into a _new_ project over overwriting the live one. Overwriting is
unrecoverable if the backup turns out to be wrong.

## Quarterly restore test

Put a reminder somewhere it will be seen. Once a quarter, restore the most
recent backup into a local database and compare row counts. Record the date and
the result here:

| Date | Backup tested | Result      |
| ---- | ------------- | ----------- |
| —    | —             | Not yet run |

## Manual backup

Before anything risky — a destructive migration, a bulk edit, a merge — take one
by hand rather than trusting last night's:

```
supabase db dump --linked -f supabase/backups/$(date +%Y%m%d-%H%M%S)-schema.sql
supabase db dump --linked --data-only -f supabase/backups/$(date +%Y%m%d-%H%M%S)-data.sql
```

`supabase/backups/` is gitignored and must stay that way — those files are
unencrypted and contain live personal data.
