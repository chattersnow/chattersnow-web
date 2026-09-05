# Granting the first admin

**Updated:** 2026-09-05

How an account gets the `admin` role, and why migrations no longer do it on
their own.

## Why this is a separate step

`20260821080000_create_roles_and_user_roles.sql` used to grant admin by matching
a hardcoded email address against `auth.users`. In production that matched the
intended account and did the right thing. Everywhere else it was a hazard: the
grant followed an **address**, not a fixed user id, so in any database where
that address was unregistered — a fresh Supabase project, a staging
environment, or a white-label deployment — whoever registered it first would
receive admin the next time migrations ran (#708).

Migrations define schema. Granting privilege to a specific person is a
deployment decision, so it is made deliberately, per environment.

## Local development

Nothing to do. `supabase/seed.sql` creates `admin@example.test` (password
`password123`) and grants it the `admin` role directly. `bun run db:reset`
gives you a working admin every time.

## Hosted environments

The account must exist before it can be granted anything. Invite the person
through the portal, or create the user in the Supabase dashboard, and have them
sign in once.

### Preferred: grant by user id

Unambiguous, and it cannot be redirected by anyone registering an address.
Find the id in the Supabase dashboard under Authentication → Users, then:

```sql
insert into public.user_roles (user_id, role_id, created_by)
select '00000000-0000-0000-0000-000000000000'::uuid,
       r.id,
       '00000000-0000-0000-0000-000000000000'::uuid
from public.roles r
where r.name = 'admin'
on conflict (user_id, role_id) do nothing;
```

Run it with `supabase db query --linked --file <path>` or from the dashboard's
SQL editor. Both act with privileges that bypass RLS, which is what makes the
first grant possible when no admin exists yet.

### Bootstrapping a brand-new environment

When standing up a fresh database — a new customer deployment, or a staging
project — you can let the migration do it, by setting the address it should
look for **before** migrations run:

```sql
alter database postgres set app.bootstrap_admin_email = 'person@example.org';
```

Then run `supabase db push`, and clear it again afterwards so it cannot affect
a later run:

```sql
alter database postgres reset app.bootstrap_admin_email;
```

Confirm the database name matches the environment (`postgres` on Supabase). A
session-level `set` is not enough — the CLI opens its own connection, so the
setting has to live on the database.

With the setting absent, the migration grants nothing and says so:

```
NOTICE:  Skipping admin bootstrap: app.bootstrap_admin_email is not set (see docs/admin-bootstrap.md).
```

That is the correct outcome for any environment you have not deliberately
bootstrapped.

## Keep at least two admins

`is_admin()` resolves to `has_permission('administration', 'manage')`, and only
an admin can grant roles. With a single admin account, losing it — lockout, a
compromised mailbox, or someone leaving — means nobody can restore access
through the application, and recovery requires direct database access.

Grant a second person the admin role using the by-user-id statement above, and
check the current state with:

```sql
select u.email, ur.created_at
from public.user_roles ur
join public.roles r on r.id = ur.role_id
join auth.users u on u.id = ur.user_id
where r.name = 'admin'
order by ur.created_at;
```

## Protect the accounts that hold it

This repository is public, and its commit history identifies the people who
work on it. Assume the production admin addresses are known. Enable MFA on the
Supabase account and on the mailbox behind each admin address — a known admin
address turns a guessing problem into a targeting problem, and MFA is the part
of that you can still control.
