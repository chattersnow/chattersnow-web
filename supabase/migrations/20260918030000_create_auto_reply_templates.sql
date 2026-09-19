-- Automatic replies a tenant writes for itself (#1233, epic #1232).
--
-- Every public form already answers the person who filled it in, and none of
-- that answer is the tenant's: "Thanks for your request. These items are now
-- on hold for you and no longer available to others" is hard-coded English in
-- src/lib/notifications/gear-request-confirmation-email.ts. On a multi-tenant
-- platform we cannot write that sentence for all of them.
--
-- This table is where a tenant's own wording lives. Nothing reads it yet --
-- #1234 makes the three existing receipts render it -- so this migration
-- changes no email.
--
-- Why a table rather than five app_settings keys. app_settings is
-- (tenant_id, key) -> jsonb, so a blob per kind would carry no `enabled`
-- column to switch a single receipt off with, and would leave one audit_log
-- row per blob rather than one per auto-reply. Here a tenant has one row per
-- reply, each independently audited and independently switchable.

create table public.auto_reply_templates (
  -- id, not (tenant_id, kind): audit_log_row() resolves a row by the
  -- pk_column registered in audited_tables (20260828060000), and `kind` is
  -- text. `unique (tenant_id, kind)` below is what the app actually looks a
  -- row up by.
  id uuid primary key default gen_random_uuid(),
  -- No `on delete cascade`, matching every other tenant table: delete_tenant()
  -- (20260906120000) deletes each tenant table by tenant_id itself, and a
  -- cascade here would let a stray delete on `tenants` take a tenant's copy
  -- with it silently.
  tenant_id uuid not null default public.default_tenant_id()
    references public.tenants(id),
  -- A key in AUTO_REPLIES (src/lib/notifications/auto-replies.ts), not a
  -- database enum, for the same reason NOTIFICATION_KINDS is not one: adding
  -- a reply should be a line in a registry and a sender that reads it, not a
  -- migration. A row whose kind no registry claims resolves to nothing and
  -- sends nothing new.
  kind text not null check (length(btrim(kind)) > 0),
  -- Per reply, which is the whole reason this is not one jsonb blob: a tenant
  -- turning off the gear receipt must not touch the event one.
  enabled boolean not null default true,
  -- Sparse on purpose: a slot key absent from the object means "still the
  -- platform default", so improving a default reaches every tenant who never
  -- touched it. An empty string is a tenant deliberately blanking a slot and
  -- is NOT the same as absent -- the merge in resolveAutoReply() reads a
  -- present empty string as blank and an absent key as the default.
  --
  -- The checks are a backstop for the service-role path, not the validation:
  -- the per-slot limits (200 for a line, 1000 for a paragraph) live in the
  -- registry, because that is where the editor in #1235 reads them from too.
  -- What they guarantee is that the merge always has an object to fold over,
  -- and that no single row can hold an unbounded amount of text.
  slots jsonb not null default '{}'::jsonb
    check (jsonb_typeof(slots) = 'object' and length(slots::text) <= 8000),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  unique (tenant_id, kind)
);

comment on table public.auto_reply_templates is
  'One row per automatic reply a tenant has written or switched off (#1233). `slots` is sparse -- an absent key is the platform default from src/lib/notifications/auto-replies.ts, an empty string is a deliberately blank slot. Read by the service-role sender, which bypasses RLS.';

comment on column public.auto_reply_templates.kind is
  'An AUTO_REPLIES registry key, e.g. event_registration_confirmation. Deliberately not an enum: a new reply is a registry entry, not a migration.';

comment on column public.auto_reply_templates.enabled is
  'False means this one receipt is off for this tenant. It is not the org-wide kill switch (notifications.email_enabled), which still governs everything.';

-- updated_at and updated_by both, as on app_settings: the function stamps
-- auth.uid() as well (20260819000000), so an edit made in a session names its
-- author without the action having to remember to.
create trigger set_updated_at before update on public.auto_reply_templates
  for each row execute function public.set_updated_at();

-- What the organization says to the people who write to it is governance-
-- sensitive in the same way the approval threshold is, and the slots are the
-- tenant's own copy rather than anybody's personal data, so nothing is
-- redacted: the trail holds the wording before and after.
insert into public.audited_tables (table_name, pk_column) values
  ('auto_reply_templates', 'id');

create trigger audit_log_row after insert or update or delete on public.auto_reply_templates
  for each row execute function public.audit_log_row();

alter table public.auto_reply_templates enable row level security;

-- The audience that already owns Administration > Organization Settings >
-- Notifications, which is where the editor (#1235) goes. No anon access ever:
-- these are read on the send path by the service-role sender, which RLS does
-- not apply to.
create policy "auto_reply_templates select" on public.auto_reply_templates for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('system_settings', 'manage')
  );

create policy "auto_reply_templates insert" on public.auto_reply_templates for insert to authenticated
  with check (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('system_settings', 'manage')
  );

create policy "auto_reply_templates update" on public.auto_reply_templates for update to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('system_settings', 'manage')
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('system_settings', 'manage')
  );

-- No delete policy and no delete grant. "Back to the platform's wording" is
-- an empty `slots` object, not a missing row -- the same row still has to
-- carry `enabled`, and dropping it would throw away the audit anchor that
-- says who changed the copy and when.
grant select, insert, update on public.auto_reply_templates to authenticated;

-- No rows are seeded, for any tenant. A tenant with no row gets the registry
-- defaults, which are today's wording verbatim, so `bun run db:reset` leaves
-- this table empty and every receipt unchanged. provision_tenant() copies
-- app_settings keys and does not touch this table, so a new tenant starts on
-- the defaults too.
