# Audit and history — specification

Part of [`docs/technical-spec.md`](../technical-spec.md) — section numbers are
unchanged. This file holds §5.11 and the audit-log data model. Technology, system boundaries, security, the
route tree and the key workflows stay in the hub. A plain `§N` below is in this
file; a `§N` that lives in another file is always a link.

## 5.11 Audit and history

The system shall preserve who changed what and when for material operational records, including:

- Inventory quantity and status
- Donations
- Distribution records
- Events
- Income and expenses
- Giveaways
- User role changes

Audit history should be append-only for normal application users. At minimum, store actor, action, entity type, entity ID, timestamp, and a structured before/after or change payload. Audit data must be visible only to authorized roles.

**Implemented for donations, inventory items/movements, event expenses, user role changes** (issue #18), **calendar items** (issue #103), **content opportunities** (issue #109), and **products, product variants, sales and sale line items** (issue #907, all four unredacted — a sale's only personal column is a foreign key to `people`); events and giveaways are not yet covered. A generic `security definer` Postgres trigger (`audit_log_row()`) fires `AFTER INSERT OR UPDATE OR DELETE` on the covered tables and writes actor (`auth.uid()`), action, table name, record ID, timestamp, and full before/after `jsonb` row snapshots to `audit_log` — chosen over application-level writes scattered across each mutating RPC/server action so coverage can't be silently skipped by a write path that forgets to log. RLS restricts reads to `has_permission('administration', 'manage')`; no insert/update/delete policy exists for any role, so the table is append-only in practice, not just by convention. Because rows are keyed by `record_id` independent of the record's current state, history survives archiving without any extra work. See [§6](../technical-spec.md#6-proposed-data-model) for the schema and Administration > Audit log for the browsing UI (filter by table/action/actor/date, sort, paginate, and view a before/after diff per entry).

Two mechanisms keep those snapshots from becoming a permanent copy of personal data ([§7.11](../technical-spec.md#711-retention-deletion-export-and-access-procedures)). At write time, `audited_tables.redacted_columns` names columns the trigger strips before recording — for data on a short published clock the log has no reason to hold at all, currently `inventory_movements.notes`. On a clock, the `audit_log_snapshots` retention rule (issue #720) clears the values of the columns registered in `retention_snapshot_personal_columns` seven years after the change, leaving the key in place holding null, and stamps `audit_log.redacted_at` so a scrubbed field is distinguishable from one that was empty at the time (the detail sheet says so). The entry itself — table, record, action, actor, timestamp, and every non-personal value — is never deleted, and the rewrite happens inside the `security definer` purge, so the table stays append-only through the API.

Administration > Audit log (issue #18) is implemented: a URL-filtered, server-paginated view over the `audit_log` table (see §5.11, [§6](../technical-spec.md#6-proposed-data-model)) with a before/after diff drawer per entry, covering donations, inventory, event expenses, user role changes, calendar items, and content opportunities.

## 6. Data model — Audit log

Implemented for the tables listed below (see §5.11, issue #18):

- `audit_log`: `id`, `tenant_id` (nullable, no FK; the audited row's tenant, null for global tables), `table_name` (FK → `audited_tables.table_name`, issue #421), `record_id`, `action` (`insert`/`update`/`delete`), `actor_id` (nullable FK → `auth.users`, null for non-request-scoped writes), `occurred_at`, `old_data`/`new_data` (full-row `jsonb` snapshots; no precomputed diff column — diffing two small `jsonb` objects is computed on read instead)
- `audited_tables`: registry table (`table_name` PK, `pk_column` defaulting to `'id'`) that both the FK above and `audit_log_row()` key off of — not exposed to the API (RLS enabled, no policies/grants), read only by the trigger function and by migrations. Onboarding a newly-audited table is one additive `insert` into this table plus a `create trigger`, not a check-constraint drop/recreate of the full accumulated list
- `audit_log_row()`: a generic `security definer` `plpgsql` trigger function fired `AFTER INSERT OR UPDATE OR DELETE` on each audited table; looks up the table's `pk_column` from `audited_tables` via `TG_TABLE_NAME` and reads `to_jsonb(NEW/OLD) ->> pk_column` for `record_id` (raising if the table isn't registered or the resolved column doesn't exist on the row), instead of assuming every table's primary key is named `id`
- RLS: select-only, restricted to `has_permission('administration', 'manage')` and to the current tenant's rows (plus rows with no tenant); no insert/update/delete policy exists for any role, so writes only ever happen through the trigger
- Currently audited: `donations`, `inventory_items`, `inventory_movements`, `event_expenses`, `user_roles`, `app_settings`, `calendar_items`, `pending_role_grants`, `content_opportunities`, `deactivated_users` (`pk_column = 'user_id'`), `event_revenue`, `reimbursements`, `content_permissions`, and the full giveaway set — `giveaways`, `giveaway_prizes`, `giveaway_winners`, `giveaway_tiers`, `giveaway_tier_grants`, `giveaway_tier_rules`, `giveaway_ticket_packages`, `giveaway_ticket_sales`, `giveaway_ticket_grants`, `giveaway_buckets` (issue #5: a ticket system that decides who wins gear needs a change history). Not yet covered: `events`
