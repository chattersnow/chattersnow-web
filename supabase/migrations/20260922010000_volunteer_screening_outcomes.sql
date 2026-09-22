-- Recording that a volunteer was screened, and nothing else (#1360).
--
-- Split out of #690, which kept the public disclosure and shipped in #1361.
-- This is the other half: once an organization screens a volunteer, the portal
-- has nowhere to record that it happened, so the only durable record of a
-- completed check is whatever the reviewer remembers or keeps in their own
-- mailbox. Since #1204 the reviewer's *question* about a background check is
-- recorded, in the application's Messages. The answer is not.
--
-- The requirement is narrow and the narrowness is the point. What is stored is
-- a level, a date, and optionally the date the clearance runs to. Never the
-- check results, never the underlying record, never a conviction and never a
-- court reference. That is the need-to-know rule in Chatter Snow's own
-- screening policy draft -- "check results are seen by the smallest possible
-- number of people, are never stored in the ops portal, and only the outcome
-- ('cleared for Tier 1, date') is recorded against the person" -- and it is
-- also the only version of this feature that is safe to put in a portal a
-- dozen people can read.
--
-- Two tables rather than columns on `people`, for the reason
-- docs/spec/volunteers.md gives at length for provisional hours: a status
-- column means every existing reader of the table has to remember a `where`
-- clause it does not have today, and the one that forgets is the bug. A
-- person_screenings row is opt-in by construction -- nothing that reads
-- `people` sees it unless it asks -- and it is the shape this schema already
-- uses for anything staff decide about a person: volunteer_applications,
-- gear_requests, person_claims.

-- ---------------------------------------------------------------------------
-- 1. The tenant's vocabulary
-- ---------------------------------------------------------------------------

-- Tiering is tenant vocabulary. One organization's "Tier 1" is another's
-- "works with participants", so a platform enum here would be the platform
-- deciding how every tenant screens -- the thing docs/licensing.md exists to
-- stop. Free text on the outcome row would be tenant-neutral too, but a label
-- typed afresh by each reviewer cannot be filtered or counted, and "who is
-- cleared for Tier 1" is the question this feature is for.
--
-- So: a catalog the tenant owns, exactly the shape volunteer_role_types has.
--
-- It ships EMPTY on every tenant, like volunteer_role_types (20260823020000)
-- and programs before it: what the levels are is an organization decision, and
-- no tenant has adopted a screening policy. Chatter Snow's leadership recorded
-- on 2026-09-21 that it runs no background checks at all. A seeded "Tier 1"
-- would be this migration inventing one.
create table public.volunteer_screening_tiers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) default public.default_tenant_id(),
  name text not null check (btrim(name) <> ''),
  -- What a role at this level can actually reach, in the tenant's own words.
  -- This is where an organization explains what a level means -- written once
  -- by an administrator, rather than re-explained per person by a reviewer,
  -- which is what a note field on the outcome would have invited.
  description text,
  sort_order integer not null default 0,
  -- Retiring a level rather than deleting it. person_screenings references
  -- this table `on delete restrict`, because the level's name *is* the
  -- outcome: a clearance whose level had been deleted would say "cleared for
  -- nothing", and a cascade would erase somebody's clearance when an
  -- administrator tidied the vocabulary.
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id),
  updated_at timestamptz not null default now(),
  -- set_updated_at() writes updated_by alongside updated_at, so a table
  -- carrying the trigger has to carry the column.
  updated_by uuid references auth.users(id),
  -- Referenced by person_screenings (tenant_id, tier_id).
  unique (tenant_id, id),
  -- One "Tier 1" per tenant. The name is the label printed against a person,
  -- so two rows carrying it is one word with two meanings. Plain, not
  -- case-folded, matching volunteer_role_types_name_key (20260906020000).
  unique (tenant_id, name)
);

create index volunteer_screening_tiers_order_idx
  on public.volunteer_screening_tiers (tenant_id, sort_order, name);

create trigger set_updated_at before update on public.volunteer_screening_tiers
  for each row execute function public.set_updated_at();

comment on table public.volunteer_screening_tiers is
  'The screening levels one tenant recognises, in its own words (#1360) -- "Tier 1", "Works with participants". Ships empty on every tenant: what the levels are is an organization decision, not a platform one.';

alter table public.volunteer_screening_tiers enable row level security;

-- The new resource on all four verbs, never OR'd with `volunteers`. The
-- catalog is gated as tightly as the outcomes because naming the levels is
-- part of the same judgement: a volunteers manager who is not trusted to see
-- who was cleared has no business deciding what "cleared" means.
create policy "volunteer_screening_tiers select" on public.volunteer_screening_tiers
  for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('volunteer_screening', 'view')
  );
create policy "volunteer_screening_tiers insert" on public.volunteer_screening_tiers
  for insert to authenticated
  with check (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('volunteer_screening', 'manage')
  );
create policy "volunteer_screening_tiers update" on public.volunteer_screening_tiers
  for update to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('volunteer_screening', 'manage')
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('volunteer_screening', 'manage')
  );
create policy "volunteer_screening_tiers delete" on public.volunteer_screening_tiers
  for delete to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('volunteer_screening', 'manage')
  );

grant select, insert, update, delete on public.volunteer_screening_tiers to authenticated;

-- ---------------------------------------------------------------------------
-- 2. The outcome
-- ---------------------------------------------------------------------------

-- Three deliberate absences, each of which is the ticket rather than an
-- oversight. They are restated in docs/spec/volunteers.md so that the next
-- person to reach for one finds the argument before the column.
--
--   * NO STATUS COLUMN, AND NO "NOT CLEARED" ROW. The row's existence is the
--     outcome. A negative row would be a durable adverse record about a person,
--     readable by everyone holding the permission, with nothing behind it that
--     the person could see or answer -- the opposite of the policy's "a record
--     is not automatically a bar, and the person is told what came up and gets
--     to respond". Where somebody is not cleared, volunteer_applications.status
--     ('declined', 'closed') already carries the operational decision and the
--     application's Messages carry the conversation. Both are things the
--     applicant was part of; this table is not.
--
--   * NO FREE TEXT OF ANY KIND -- no note, no reference, no provider, no
--     result. This is the single load-bearing constraint in #1360: any text box
--     here eventually contains a conviction. The guarantee that check results
--     are never stored in the portal is therefore a SCHEMA guarantee rather
--     than a validation one, which is the only kind that survives a future
--     ticket. `created_by` and `cleared_on` answer "who decided and when"
--     without prose, and the level's own description answers "what does this
--     mean" once, on the catalog above.
--
--   * NO SINGLE CURRENT ROW PER (person, level). A re-screen is a new row, not
--     an edit. "Cleared for Tier 1 in 2026, and again in 2029" is exactly what
--     a recheck schedule (#1320) will need, and an update would destroy it.
create table public.person_screenings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) default public.default_tenant_id(),
  -- Both foreign keys are composite and declared below.
  person_id uuid not null,
  tier_id uuid not null,
  -- The date on the outcome, which is the reviewer's to state: a check
  -- completed last Tuesday is recorded today with last Tuesday's date.
  cleared_on date not null,
  -- Nullable, and display only (#1360). Nothing in this deployment reads it
  -- except the person's profile card, which renders it and marks a past one
  -- expired. There is no reminder, no ops-inbox item and no block on assigning
  -- a role, because a recheck SCHEDULE is tenant policy and lives in #1320.
  -- The column exists now because adding one later to an audited, RLS'd,
  -- retention-swept table is a second migration for something free today.
  expires_on date,
  created_at timestamptz not null default now(),
  -- Who recorded it. This is the whole of "a decision names its author and its
  -- moment" for this table -- there is no reviewed_by/reviewed_at pair,
  -- because unlike person_claims or volunteer_hour_submissions nothing here
  -- was submitted by somebody else and then decided on.
  created_by uuid default auth.uid() references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  -- Composite, like every other reference between two tenant tables
  -- (20260906080000): row-level security decides which rows a session can see
  -- and says nothing about which rows a column may point at, so a cross-tenant
  -- reference has to be refused by the database itself.
  constraint person_screenings_person_in_tenant
    foreign key (tenant_id, person_id)
    references public.people (tenant_id, id) on delete cascade,
  constraint person_screenings_tier_in_tenant
    foreign key (tenant_id, tier_id)
    references public.volunteer_screening_tiers (tenant_id, id) on delete restrict,
  constraint person_screenings_expiry_after_clearance
    check (expires_on is null or expires_on >= cleared_on),
  -- Same person, same level, same day is the same decision. This is the
  -- double-tapped submit button and nothing more: re-screening on any later
  -- date is a new row and always allowed.
  constraint person_screenings_one_per_day
    unique (tenant_id, person_id, tier_id, cleared_on)
);

-- No `unique (tenant_id, id)`: nothing references this table, and
-- 20260906080000 attaches that key to the parents of composite foreign keys.

create index person_screenings_person_idx
  on public.person_screenings (tenant_id, person_id, cleared_on desc);
create index person_screenings_tier_idx
  on public.person_screenings (tenant_id, tier_id);

create trigger set_updated_at before update on public.person_screenings
  for each row execute function public.set_updated_at();

comment on table public.person_screenings is
  'The outcome of a volunteer screening and nothing else (#1360): which level, when, and when the clearance runs to. There is deliberately no column for a note, a reference, an interview, a check, a result or a provider -- the promise that check results are never stored in the portal is a schema guarantee here, not a validation one.';

comment on column public.person_screenings.expires_on is
  'When this clearance runs to, or null where it does not expire (#1360). Display only: nothing reminds anyone, nothing blocks a role, and nothing reads it but the profile card. The recheck schedule is tenant policy (#1320).';

alter table public.person_screenings enable row level security;

-- The gate is `volunteer_screening`, never `volunteers`, and the two are never
-- OR'd. This is what makes the person profile card safe without the page
-- having to remember anything: a volunteers:manage holder selecting this table
-- gets zero rows, in the database, whatever any component forgets to check.
create policy "person_screenings select" on public.person_screenings
  for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('volunteer_screening', 'view')
  );
create policy "person_screenings insert" on public.person_screenings
  for insert to authenticated
  with check (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('volunteer_screening', 'manage')
  );
create policy "person_screenings update" on public.person_screenings
  for update to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('volunteer_screening', 'manage')
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('volunteer_screening', 'manage')
  );
create policy "person_screenings delete" on public.person_screenings
  for delete to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('volunteer_screening', 'manage')
  );

grant select, insert, update, delete on public.person_screenings to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The permission
-- ---------------------------------------------------------------------------

-- A resource of its own rather than `volunteers`, which is docs/permissions.md
-- option 3 -- "content inside an area that a different audience reads", the
-- shape event_incidents and constituent_claims already have. Whether somebody
-- was screened is a different question from whether a coordinator may edit the
-- role catalog or work the application queue, and it is the more sensitive of
-- the two by some distance.
--
-- It costs nobody access today: volunteers:manage is held by `admin` alone
-- (20260822090000), and so is this. What it buys is that the two can move
-- apart -- a safeguarding lead can be given screening without the rest of the
-- module, and, more to the point, widening volunteers:manage later cannot
-- silently hand out screening data with nothing in the matrix showing it
-- happened, which is the failure docs/permissions.md exists to prevent.
--
-- sort_order 105 puts it between `volunteers` (100) and `governance` (110),
-- inside the Volunteers section it belongs to.
insert into public.resources (key, section, label, description, sort_order, module_key) values
  ('volunteer_screening', 'Volunteers', 'Screening outcomes',
   'Which screening level a volunteer has been cleared for, and when',
   105, 'volunteers');

-- admin: manage and nothing else, the conservative default docs/permissions.md
-- asks for. Deliberately NOT mirroring `volunteers`, which gives view to
-- event_coordinator and volunteer: those two see the role catalog, the
-- participation ledger and the application queue, and none of that implies
-- seeing who has been screened. An administrator can widen it from
-- Administration > Permissions without another migration.
--
-- Joined by role name so every tenant's roles are covered, not just the
-- template's -- roles are per tenant since Phase 2.
insert into public.role_permissions (role_id, resource_id, level)
select r.id, res.id, v.level
from (values
  ('admin', 'volunteer_screening', 'manage'),
  ('event_coordinator', 'volunteer_screening', 'none'),
  ('finance', 'volunteer_screening', 'none'),
  ('board', 'volunteer_screening', 'none'),
  ('volunteer', 'volunteer_screening', 'none')
) as v(role_name, resource_key, level)
join public.roles r on r.name = v.role_name
join public.resources res on res.key = v.resource_key;

-- ---------------------------------------------------------------------------
-- 4. Audit
-- ---------------------------------------------------------------------------

-- Recording that somebody was cleared is a decision about a person, which is
-- the same argument that makes person_claims and volunteer_hour_submissions
-- audited. Removing one is a decision too, and the trail is what keeps it: the
-- old row survives in audit_log.old_data, so "this clearance existed, and X
-- deleted it on the 2nd" is answerable.
--
-- redacted_columns is EMPTY on both tables, and that is the payoff of the
-- narrow schema rather than an oversight. 20260907150000 draws the line:
-- "Ids are deliberately NOT registered: the person row an id points at is
-- anonymized by the same job... Amounts, statuses, quantities and dates are
-- the audit trail's whole point and stay." Every column here is an id, a date
-- or a tenant-authored label. There is no prose to redact because there is
-- nowhere to write any. A table with a notes column would have needed a
-- redaction decision and an entry in retention_snapshot_personal_columns;
-- this one needs neither.
insert into public.audited_tables (table_name, pk_column, redacted_columns) values
  ('volunteer_screening_tiers', 'id', '{}'),
  ('person_screenings', 'id', '{}');

create trigger audit_log_row after insert or update or delete
  on public.volunteer_screening_tiers
  for each row execute function public.audit_log_row();

create trigger audit_log_row after insert or update or delete
  on public.person_screenings
  for each row execute function public.audit_log_row();

-- ---------------------------------------------------------------------------
-- 5. Retention
-- ---------------------------------------------------------------------------

-- A screening outcome is personal data about a volunteer and belongs on
-- Administration > Data Retention with the rest. The PERIOD is a tenant
-- decision and joins the #1320 group E conversation rather than being invented
-- here; what ships is the proposal, in dry_run like every rule before it, so
-- the nightly job reports a real count and changes nothing until an
-- administrator turns it on.
--
-- 3 years, matching event_registrations and gear_requests -- this schema's
-- "operational history across three seasons" clock.
--
-- Measured from coalesce(expires_on, cleared_on), not from the decision alone:
-- a clearance that runs to 2032 is live until 2032, and a clock starting at
-- the decision would purge a current clearance. Not updated_at either, which
-- would restart the clock every time somebody corrected a typo.
--
-- One row per tenant, tenant_id named rather than defaulted -- the form
-- 20260907150000 uses, for the reason its comment gives: retention_policies
-- is keyed (tenant_id, policy_key) and its tenant_id default resolves to the
-- sole active tenant only when there is exactly one, which is true of a local
-- `supabase db reset` and false of the hosted project. New tenants inherit
-- this through seed_tenant_retention_policies() (20260906160000).
--
-- volunteer_screening_tiers gets no clock at all: a level is tenant
-- vocabulary, not personal data, and `on delete restrict` means it cannot
-- outlive the outcomes that cite it in any way that matters.
--
-- person_screenings.person_id is deliberately NOT added to
-- retention_purgeable_person_refs. That list defaults to "retain", which is
-- the safe direction 20260905090000 argues for: a person holding a live
-- clearance is not anonymized out from under it, and once the rule below
-- deletes the outcome the person becomes anonymizable on their own clock.
insert into public.retention_policies (tenant_id, policy_key, label, period, mode, description)
select t.id, 'person_screenings', 'Volunteer screening outcomes', interval '3 years', 'dry_run',
       'Measured from the date a clearance runs to, or from the date of the outcome where it has no end date. The level and its dates are deleted; that an outcome was recorded, by whom and when, survives in the audit trail. No check result was ever stored to delete. The screening levels themselves are vocabulary rather than personal data and are never purged. PROPOSED, not board-approved.'
  from public.tenants t;

-- ---------------------------------------------------------------------------
-- 6. The purge
-- ---------------------------------------------------------------------------

-- run_retention_purge(): the body from 20260919040000, the live one, with one
-- new block at the end of the tenant loop (search for "O."). Everything else
-- is byte-for-byte unchanged. Re-emitted in full because the function is one
-- plpgsql block, so adding a rule is a rewrite rather than a patch; the
-- signature is unchanged, so `create or replace` is enough and the pg_cron
-- entry (20260905140000) keeps resolving to this one.

create or replace function public.run_retention_purge(
  p_dry_run boolean default true,
  p_as_of timestamptz default now(),
  p_trigger text default 'cron',
  p_tenant_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_run_id uuid;
  v_result_run_id uuid;
  v_ids uuid[];
  v_person_ids uuid[];
  v_failed boolean := false;
  v_period interval;
  v_secondary interval;
  v_mode text;
  v_enforce boolean;
  -- Rule N's three values, computed once above the loop and logged inside it.
  v_account_ids uuid[] := '{}';
  v_account_enforce boolean := false;
  v_account_error text;
begin
  -- A manual dry run from the portal must not interleave with the nightly job.
  -- Transaction-scoped, so it releases on commit or rollback either way.
  if not pg_try_advisory_xact_lock(hashtext('retention_purge')) then
    return null;
  end if;

  -- Rule H, once for the sweep rather than once per tenant. rate_limit_hits is
  -- keyed by IP and route and has no tenant_id, so there is nothing to scope --
  -- but its policy row is per-tenant now, and purge_rate_limit_hits() takes the
  -- strictest clock any tenant has set. Each tenant's run still logs the rule,
  -- inside the loop, so the Data Retention page explains it as before.
  if not p_dry_run then
    perform public.purge_rate_limit_hits(p_as_of);
  end if;

  -- N, part one (#1296). Website accounts, decided and applied once for the
  -- whole platform rather than once per tenant.
  --
  -- The second rule with nothing to scope, for a stronger reason than rule H's:
  -- an account has no tenant until a claim is approved. Somebody signs up at
  -- /my against whichever host they were on and nothing records which --
  -- deliberately, because #1161 resolves a constituent's tenant from the
  -- request rather than from a membership. There is no tenant whose sweep owns
  -- the row.
  --
  -- Two consequences, both the conservative direction:
  --
  --   * the clock is the SHORTEST any tenant has set, as rule H's is. An
  --     account belongs to a person rather than to an organization, so no
  --     tenant's choice may extend how long another's sign-up is held.
  --   * it enforces only where EVERY active tenant has the rule enforcing. One
  --     organization that has not agreed to the period is a veto, because the
  --     row it would remove is as much the next organization's as its own. A
  --     tenant with no row at all reads as 'off' and vetoes too.
  --
  -- The candidate list is read whatever the modes say, so a dry run reports
  -- real counts. It is read here rather than after the loop, so rules L and M
  -- below have not yet dropped this run's expired claims: an account those
  -- deletions free is deleted by the next night's run, not this one. The same
  -- conservatism rule D2 records, and for the same reason -- reporting the
  -- accounts that are already free is checkable, and simulating the ones a
  -- later rule in the same run would free is not.
  --
  -- In its own exception block, unlike rule H's call, which is bare: this one
  -- deletes from auth.users, where a reference the walk cannot see (an
  -- extension's table, storage.objects.owner) raises 23503. The sweep has to
  -- survive that and report it, which is what v_account_error carries into
  -- every tenant's run below.
  begin
    select min(period) into v_period
      from public.retention_policies where policy_key = 'constituent_accounts';

    if v_period is not null then
      v_account_ids := public.retention_unclaimed_account_ids(p_as_of - v_period);

      v_account_enforce := not p_dry_run and not exists (
        select 1
          from public.tenants t
          left join public.retention_policies p
            on p.tenant_id = t.id and p.policy_key = 'constituent_accounts'
         where t.status = 'active'
           and coalesce(p.mode, 'off') <> 'enforce'
      );

      if v_account_enforce and array_length(v_account_ids, 1) is not null then
        delete from auth.users where id = any(v_account_ids);
      end if;
    end if;
  exception when others then
    v_account_error := sqlerrm;
    v_account_ids := '{}';
  end;

  for v_tenant in
    select t.id
      from public.tenants t
     where t.status = 'active'
       and (p_tenant_id is null or t.id = p_tenant_id)
     order by t.created_at
  loop
    v_failed := false;

    insert into public.retention_runs (tenant_id, as_of, dry_run, trigger, triggered_by, status)
    values (v_tenant, p_as_of, p_dry_run, p_trigger, auth.uid(), 'running')
    returning id into v_run_id;

    if v_tenant = p_tenant_id then
      v_result_run_id := v_run_id;
    end if;

    -- Each rule gets its own exception block. A plpgsql exception block is a
    -- subtransaction, so a rule that fails rolls back only itself and the run
    -- finishes as 'partial' with the error recorded against that rule -- rather
    -- than one bad clock discarding the work of the other eight.

    -- H. Abuse-protection records. Not mode-gated; see purge_rate_limit_hits.
    --
    -- The only rule with no tenant dimension: rate_limit_hits is keyed by IP and
    -- route, has no tenant_id, and is correctly global (20260906010000 lists it
    -- among the twelve tables that stay platform-wide). The sweep therefore runs
    -- the purge once, above the loop, and each tenant's run logs the rule so the
    -- page still explains it rather than appearing to have skipped it.
    begin
      perform public.retention_log(v_run_id, 'rate_limit_hits', 'rate_limit_hits',
        case when p_dry_run then 'skipped' else 'deleted' end, '{}');
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'rate_limit_hits', 'rate_limit_hits', 'skipped', sqlerrm);
    end;

    -- A. Contact form messages. The one table here that is safe to delete
    -- outright: nothing has a foreign key to it and it carries no audit trigger.
    begin
      select period, mode into v_period, v_mode
        from public.retention_policies
         where policy_key = 'contact_messages' and tenant_id = v_tenant;
      v_enforce := not p_dry_run and v_mode = 'enforce';

      if v_mode = 'off' then
        perform public.retention_log(v_run_id, 'contact_messages', 'contact_messages', 'skipped', '{}');
      else
        v_ids := array(
          select id from public.contact_messages
           where tenant_id = v_tenant and created_at < p_as_of - v_period
        );
        perform public.retention_log(v_run_id, 'contact_messages', 'contact_messages', 'deleted', v_ids);
        if v_enforce and array_length(v_ids, 1) is not null then
          delete from public.contact_messages where id = any(v_ids);
        end if;
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'contact_messages', 'contact_messages', 'skipped', sqlerrm);
    end;

    -- C. Event registrations: strip the person, keep the row.
    --
    -- name and email are NOT NULL (20260823090000), so they take sentinels rather
    -- than nulls. '' is the established "no email" value -- both unique indexes
    -- here are partial (WHERE email <> '', WHERE person_id IS NOT NULL, see
    -- 20260901010000), which is exactly what makes anonymizing many rows of one
    -- event safe. party_size, checked_in_at and the three *_at_event snapshot
    -- columns survive untouched: they are the impact figures this rule exists to
    -- preserve.
    begin
      select period, mode into v_period, v_mode
        from public.retention_policies
         where policy_key = 'event_registrations' and tenant_id = v_tenant;
      v_enforce := not p_dry_run and v_mode = 'enforce';

      if v_mode = 'off' then
        perform public.retention_log(v_run_id, 'event_registrations', 'event_registrations', 'skipped', '{}');
      else
        v_ids := array(
          select r.id
            from public.event_registrations r
            join public.events e on e.id = r.event_id
           where r.tenant_id = v_tenant
             and coalesce(e.ends_at, e.starts_at) < p_as_of - v_period
             and (r.name <> 'Removed' or r.person_id is not null
                  or r.phone is not null or r.notes is not null
                  or r.instagram_handle is not null or r.pronouns is not null)
        );
        perform public.retention_log(v_run_id, 'event_registrations', 'event_registrations', 'anonymized', v_ids);
        if v_enforce and array_length(v_ids, 1) is not null then
          update public.event_registrations
             set name = 'Removed',
                 email = '',
                 phone = null,
                 notes = null,
                 instagram_handle = null,
                 pronouns = null,
                 person_id = null
           where id = any(v_ids);
        end if;
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'event_registrations', 'event_registrations', 'skipped', sqlerrm);
    end;

    -- B. Volunteer applications. Two clocks: the published policy is "2 years
    -- after your last activity with us, or 1 year if the application is withdrawn
    -- or declined". There is no 'withdrawn' status in the check constraint
    -- (20260827000000) -- 'declined' and 'closed' are the states that mean it,
    -- and status is what selects the clock.
    --
    -- The main clock reads person_last_activity_at, not just the row's
    -- updated_at, so a 'placed' application belonging to a volunteer who is still
    -- turning up does not expire merely because nobody has edited the record.
    begin
      select period, secondary_period, mode into v_period, v_secondary, v_mode
        from public.retention_policies
         where policy_key = 'volunteer_applications' and tenant_id = v_tenant;
      v_enforce := not p_dry_run and v_mode = 'enforce';

      if v_mode = 'off' then
        perform public.retention_log(v_run_id, 'volunteer_applications', 'volunteer_applications', 'skipped', '{}');
      else
        v_ids := array(
          select a.id
            from public.volunteer_applications a
           where a.tenant_id = v_tenant
             and case
                   when a.status in ('declined', 'closed')
                     then a.updated_at < p_as_of - v_secondary
                   else greatest(a.updated_at,
                                 public.person_last_activity_at(a.person_id))
                          < p_as_of - v_period
                 end
        );
        perform public.retention_log(v_run_id, 'volunteer_applications', 'volunteer_applications', 'deleted', v_ids);
        if v_enforce and array_length(v_ids, 1) is not null then
          delete from public.volunteer_applications where id = any(v_ids);
        end if;
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'volunteer_applications', 'volunteer_applications', 'skipped', sqlerrm);
    end;

    -- E. Gear requests. The movement row is inventory history and stays; only the
    -- requester goes -- the link, and now the free text they wrote on the request
    -- form, which #721 moved off people.notes and onto the movement. Their name,
    -- email and phone are still not on the movement -- request_gear_items() puts
    -- those on a people row via resolve_or_create_person_by_email() -- so
    -- unlinking here is what lets the person rule below reach them.
    begin
      select period, mode into v_period, v_mode
        from public.retention_policies
         where policy_key = 'gear_requests' and tenant_id = v_tenant;
      v_enforce := not p_dry_run and v_mode = 'enforce';

      if v_mode = 'off' then
        perform public.retention_log(v_run_id, 'gear_requests', 'inventory_movements', 'skipped', '{}');
      else
        v_ids := array(
          select m.id
            from public.inventory_movements m
           where m.tenant_id = v_tenant
             and m.recipient_person_id is not null
             and m.movement_type in ('reserved', 'distributed')
             and m.occurred_at < p_as_of - v_period
        );
        perform public.retention_log(v_run_id, 'gear_requests', 'inventory_movements', 'anonymized', v_ids);
        if v_enforce and array_length(v_ids, 1) is not null then
          update public.inventory_movements set recipient_person_id = null, notes = null
           where id = any(v_ids);
        end if;
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'gear_requests', 'inventory_movements', 'skipped', sqlerrm);
    end;

    -- E2. Gear request headers (#1032). The delivery method, the postage quote
    -- and the status are inventory history and stay; the requester link, the
    -- shipping address, the payment preference and the request notes go on the
    -- same clock as the movements above. Measured from the handover -- the
    -- fulfilment, else the cancellation, else the request itself.
    begin
      select period, mode into v_period, v_mode
        from public.retention_policies
         where policy_key = 'gear_requests' and tenant_id = v_tenant;
      v_enforce := not p_dry_run and v_mode = 'enforce';

      if v_mode = 'off' then
        perform public.retention_log(v_run_id, 'gear_requests', 'gear_requests', 'skipped', '{}');
      else
        v_ids := array(
          select r.id
            from public.gear_requests r
           where r.tenant_id = v_tenant
             and (r.person_id is not null
                  or r.ship_line1 is not null
                  or r.payment_method is not null
                  or r.notes is not null)
             and coalesce(r.fulfilled_at, r.cancelled_at, r.created_at) < p_as_of - v_period
        );
        perform public.retention_log(v_run_id, 'gear_requests', 'gear_requests', 'anonymized', v_ids);
        if v_enforce and array_length(v_ids, 1) is not null then
          update public.gear_requests
             set person_id = null,
                 ship_name = null,
                 ship_line1 = null,
                 ship_line2 = null,
                 ship_city = null,
                 ship_region = null,
                 ship_postal_code = null,
                 ship_country = null,
                 payment_method = null,
                 notes = null
           where id = any(v_ids);
        end if;
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'gear_requests', 'gear_requests', 'skipped', sqlerrm);
    end;

    -- D1. Rider profiles, and the backfill that has to come first.
    --
    -- The impact RPCs read coalesce(registration.*_at_event, the live people row)
    -- (20260904140000), and the snapshot trigger only stamps on the check-in
    -- transition (20260904120000). So any registration checked in before that
    -- migration, or whose person had no profile at the time, still resolves
    -- through people. Clearing the person's rider columns without stamping the
    -- snapshot first would silently change beginner counts on events that closed
    -- years ago. Backfill, then clear, in that order, in one transaction.
    begin
      select period, mode into v_period, v_mode
        from public.retention_policies
         where policy_key = 'rider_profiles' and tenant_id = v_tenant;
      v_enforce := not p_dry_run and v_mode = 'enforce';

      if v_mode = 'off' then
        perform public.retention_log(v_run_id, 'rider_profiles', 'people', 'skipped', '{}');
      else
        v_person_ids := array(
          select p.id
            from public.people p
           where p.tenant_id = v_tenant
             and p.riding_discipline is not null
             and public.person_last_activity_at(p.id) < p_as_of - v_period
        );

        v_ids := array(
          select r.id
            from public.event_registrations r
            join public.people p on p.id = r.person_id
           where r.tenant_id = v_tenant
             and r.checked_in_at is not null
             and r.riding_discipline_at_event is null
             and p.riding_discipline is not null
             and p.id = any(v_person_ids)
        );
        perform public.retention_log(v_run_id, 'rider_profiles', 'event_registrations', 'backfilled', v_ids);

        if v_enforce and array_length(v_person_ids, 1) is not null then
          update public.event_registrations r
             set riding_discipline_at_event = p.riding_discipline,
                 ski_experience_level_at_event = p.ski_experience_level,
                 snowboard_experience_level_at_event = p.snowboard_experience_level
            from public.people p
           where p.id = r.person_id
             and r.tenant_id = v_tenant
             and r.checked_in_at is not null
             and r.riding_discipline_at_event is null
             and p.riding_discipline is not null
             and p.id = any(v_person_ids);
        end if;

        perform public.retention_log(v_run_id, 'rider_profiles', 'people', 'cleared', v_person_ids);

        -- All four columns in one statement: people_ski_level_requires_ski and
        -- people_snowboard_level_requires_snowboard (20260901050000) fire if a
        -- level outlives its discipline, which is why merge_people() handles them
        -- as a group too.
        if v_enforce and array_length(v_person_ids, 1) is not null then
          update public.people
             set riding_discipline = null,
                 ski_experience_level = null,
                 snowboard_experience_level = null,
                 preferred_mountain = null
           where id = any(v_person_ids);
        end if;
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'rider_profiles', 'people', 'skipped', sqlerrm);
    end;

    -- D2. Anonymize the person, when nothing else needs them.
    --
    -- Runs last of the person rules on purpose: retention_person_is_retained()
    -- has to observe the state after C, B and E dropped their references. In a
    -- dry run those references are still there, so this count is conservative --
    -- it reports the people who are *already* free, not the ones the same run
    -- would free. Say so on the page rather than trying to simulate it.
    --
    -- The row is never deleted. ~40 foreign keys point at people, nearly all
    -- NO ACTION, so a delete would fail for anyone with any history; is_anonymous
    -- is how this schema has always expressed "a person we keep no details for"
    -- (the donor_identified_or_anonymous check permits a null name only then, and
    -- people_email_key excludes anonymized rows from the unique index).
    begin
      select period, mode into v_period, v_mode
        from public.retention_policies
         where policy_key = 'rider_profiles' and tenant_id = v_tenant;
      v_enforce := not p_dry_run and v_mode = 'enforce';

      if v_mode = 'off' then
        perform public.retention_log(v_run_id, 'rider_profiles', 'people', 'skipped', '{}');
      else
        v_person_ids := array(
          select p.id
            from public.people p
           where p.tenant_id = v_tenant
             and p.auth_user_id is null
             and not p.is_anonymous
             and public.person_last_activity_at(p.id) < p_as_of - v_period
             and not public.retention_person_is_retained(p.id)
        );
        perform public.retention_log(v_run_id, 'rider_profiles', 'people', 'anonymized', v_person_ids);
        if v_enforce and array_length(v_person_ids, 1) is not null then
          update public.people
             set is_anonymous = true,
                 name = null,
                 preferred_name = null,
                 email = null,
                 phone = null,
                 instagram_handle = null,
                 pronouns = null,
                 notes = null
           where id = any(v_person_ids);
        end if;
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'rider_profiles', 'people', 'skipped', sqlerrm);
    end;

    -- F. Portal accounts.
    --
    -- auth.users is never touched. audit_log.actor_id references it with no ON
    -- DELETE, as do ~120 other created_by/updated_by columns across the schema, so
    -- deleting an account that ever wrote a row raises 23503 -- and the audit
    -- trail is retained separately for governance, security, audit, insurance and
    -- legal purposes anyway. What this rule does is clear the personal details on
    -- the linked people row and remove any role grant that outlived the
    -- deactivation. /privacy is worded to match (see the same PR).
    begin
      select period, mode into v_period, v_mode
        from public.retention_policies
         where policy_key = 'portal_accounts' and tenant_id = v_tenant;
      v_enforce := not p_dry_run and v_mode = 'enforce';

      if v_mode = 'off' then
        perform public.retention_log(v_run_id, 'portal_accounts', 'people', 'skipped', '{}');
      else
        v_person_ids := array(
          select p.id
            from public.people p
            join public.deactivated_users d on d.user_id = p.auth_user_id
           where p.tenant_id = v_tenant
             and d.deactivated_at < p_as_of - v_period
             and not p.is_anonymous
        );
        perform public.retention_log(v_run_id, 'portal_accounts', 'people', 'anonymized', v_person_ids);
        if v_enforce and array_length(v_person_ids, 1) is not null then
          -- tenant_id, not just the user id. deactivated_users is platform-wide
          -- (20260906010000 keeps it global: one row per auth account), so the
          -- unscoped form deleted that account's roles in every tenant it belonged
          -- to -- the one place the purge wrote outside the tenant it was sweeping.
          delete from public.user_roles
           where tenant_id = v_tenant
             and user_id in (
               select p.auth_user_id from public.people p where p.id = any(v_person_ids)
             );
          update public.people
             set is_anonymous = true,
                 name = null,
                 preferred_name = null,
                 email = null,
                 phone = null,
                 instagram_handle = null,
                 pronouns = null,
                 notes = null
           where id = any(v_person_ids);
        end if;
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'portal_accounts', 'people', 'skipped', sqlerrm);
    end;

    -- G. Unclaimed portal invitations. pending_role_grants holds an email address
    -- and its own header (20260824060000) says there is no cleanup job; this is
    -- that job. Note the residual: the table is audited, so the delete writes the
    -- email into audit_log.old_data, which has no clock of its own. That is a real
    -- if smaller exposure than leaving the live row, and is tracked separately.
    begin
      select period, mode into v_period, v_mode
        from public.retention_policies
         where policy_key = 'pending_role_grants' and tenant_id = v_tenant;
      v_enforce := not p_dry_run and v_mode = 'enforce';

      if v_mode = 'off' then
        perform public.retention_log(v_run_id, 'pending_role_grants', 'pending_role_grants', 'skipped', '{}');
      else
        v_ids := array(
          select g.id
            from public.pending_role_grants g
           where g.tenant_id = v_tenant
             and ((g.status in ('claimed', 'revoked') and g.created_at < p_as_of - v_period)
              or (g.status = 'pending' and g.expires_at < p_as_of - v_period))
        );
        perform public.retention_log(v_run_id, 'pending_role_grants', 'pending_role_grants', 'deleted', v_ids);
        if v_enforce and array_length(v_ids, 1) is not null then
          delete from public.pending_role_grants where id = any(v_ids);
        end if;
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'pending_role_grants', 'pending_role_grants', 'skipped', sqlerrm);
    end;

    -- I. Audit trail snapshots (#720). Redaction, not deletion.
    --
    -- Runs after every rule above on purpose: A, C, E and G have just written
    -- this tenant's old values into audit_log.old_data, and the entries they
    -- wrote tonight are the ones a reader would most expect to find scrubbed
    -- seven years from now. Order does not matter for correctness -- the clock
    -- is the entry's own occurred_at -- but it is the order the rules read in.
    --
    -- Only entries that still hold something are counted or touched: a snapshot
    -- whose registered keys are all jsonb null already is finished, and without
    -- that test it would be rewritten and re-reported every night forever.
    --
    -- Null tenant_id means an audit entry for one of the global tables
    -- (deactivated_users, retention_policies, tenants ...). Those belong to the
    -- platform tenant, which is how 20260906160000 backfilled the historical
    -- ones, so the oldest tenant's run is what sweeps them -- rather than their
    -- being visible to every tenant's admin and swept by none.
    begin
      select period, mode into v_period, v_mode
        from public.retention_policies
       where policy_key = 'audit_log_snapshots' and tenant_id = v_tenant;
      v_enforce := not p_dry_run and v_mode = 'enforce';

      if v_mode = 'off' then
        perform public.retention_log(v_run_id, 'audit_log_snapshots', 'audit_log', 'skipped', '{}');
      else
        v_ids := array(
          select a.id
            from public.audit_log a
           where (a.tenant_id = v_tenant
                  or (a.tenant_id is null
                      and v_tenant = (select t.id from public.tenants t
                                       order by t.created_at limit 1)))
             and a.redacted_at is null
             and a.occurred_at < p_as_of - v_period
             and public.retention_snapshot_has_personal_data(a.table_name, a.old_data, a.new_data)
        );
        perform public.retention_log(v_run_id, 'audit_log_snapshots', 'audit_log', 'redacted', v_ids);
        if v_enforce and array_length(v_ids, 1) is not null then
          update public.audit_log a
             set old_data = public.retention_redact_snapshot(a.table_name, a.old_data),
                 new_data = public.retention_redact_snapshot(a.table_name, a.new_data),
                 redacted_at = now()
           where a.id = any(v_ids);
        end if;
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'audit_log_snapshots', 'audit_log', 'skipped', sqlerrm);
    end;

    -- J. Merge snapshots (#720). Same treatment, one clock later in the record's
    -- life: person_merges holds two whole people rows, and the registered people
    -- columns are the same eleven rules D1 and D2 clear on a live person. The
    -- merge itself -- who merged whom, when, and the counts of what moved -- is
    -- untouched, which is what the table exists for.
    begin
      select period, mode into v_period, v_mode
        from public.retention_policies
       where policy_key = 'person_merge_snapshots' and tenant_id = v_tenant;
      v_enforce := not p_dry_run and v_mode = 'enforce';

      if v_mode = 'off' then
        perform public.retention_log(v_run_id, 'person_merge_snapshots', 'person_merges', 'skipped', '{}');
      else
        v_ids := array(
          select m.id
            from public.person_merges m
           where m.tenant_id = v_tenant
             and m.redacted_at is null
             and m.merged_at < p_as_of - v_period
             and public.retention_snapshot_has_personal_data('people', m.merged_snapshot, m.survivor_before)
        );
        perform public.retention_log(v_run_id, 'person_merge_snapshots', 'person_merges', 'redacted', v_ids);
        if v_enforce and array_length(v_ids, 1) is not null then
          update public.person_merges m
             set merged_snapshot = public.retention_redact_snapshot('people', m.merged_snapshot),
                 survivor_before = public.retention_redact_snapshot('people', m.survivor_before),
                 redacted_at = now()
           where m.id = any(v_ids);
        end if;
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'person_merge_snapshots', 'person_merges', 'skipped', sqlerrm);
    end;

    -- K. Staff messages and resent receipts (#1203). What survives is the fact
    -- of the send -- when, by whom, about which record, and whether it was
    -- delivered; what goes is the correspondence itself and everyone named in
    -- it. Cleared rather than deleted, for the same reason rule E2 keeps the
    -- gear request: the detail view says "three messages went out about this
    -- request" long after it may say what any of them were.
    --
    -- to_email, subject and body are not null, so they take the empty-string
    -- sentinel rule C uses rather than the constraints being dropped.
    begin
      select period, mode into v_period, v_mode
        from public.retention_policies
       where policy_key = 'outbound_messages' and tenant_id = v_tenant;
      v_enforce := not p_dry_run and v_mode = 'enforce';

      if v_mode = 'off' then
        perform public.retention_log(v_run_id, 'outbound_messages', 'outbound_messages', 'skipped', '{}');
      else
        v_ids := array(
          select m.id
            from public.outbound_messages m
           where m.tenant_id = v_tenant
             and (m.person_id is not null or m.to_email <> ''
                  or m.subject <> '' or m.body <> '')
             and m.created_at < p_as_of - v_period
        );
        perform public.retention_log(v_run_id, 'outbound_messages', 'outbound_messages', 'anonymized', v_ids);
        if v_enforce and array_length(v_ids, 1) is not null then
          update public.outbound_messages
             set person_id = null, to_email = '', subject = '', body = ''
           where id = any(v_ids);
        end if;
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'outbound_messages', 'outbound_messages', 'skipped', sqlerrm);
    end;

    -- L. Record claims (#1296). What somebody typed to persuade us a record
    -- is theirs -- a name, usually an address or a phone number, sometimes a
    -- note -- which a refused claim leaves us holding about a person who is
    -- not the person in the record.
    --
    -- Deleted rather than cleared, like the volunteer application it most
    -- resembles: person_claims is audited, so the decision itself (approved or
    -- refused, by whom, when) survives in audit_log on its own clock, and
    -- nothing reports on a claim.
    --
    -- This rule has no audit-log residual, unlike rule G's. Every stated_*
    -- column and both notes are in audited_tables.redacted_columns
    -- (20260916060000), so the trigger strips them before recording -- the
    -- write-time half of the two mechanisms in docs/spec/audit.md. The delete
    -- therefore leaves no copy of what the claimant typed anywhere.
    --
    -- updated_at carries both questions the decision record asks on one clock.
    -- It is the moment of the decision for a claim somebody decided, and --
    -- defaulted to created_at and maintained by set_updated_at, which no
    -- client can backdate -- the moment it was sent for one nobody did.
    begin
      select period, mode into v_period, v_mode
        from public.retention_policies
       where policy_key = 'person_claims' and tenant_id = v_tenant;
      v_enforce := not p_dry_run and v_mode = 'enforce';

      if v_mode = 'off' then
        perform public.retention_log(v_run_id, 'person_claims', 'person_claims', 'skipped', '{}');
      else
        v_ids := array(
          select c.id
            from public.person_claims c
           where c.tenant_id = v_tenant
             and c.updated_at < p_as_of - v_period
        );
        perform public.retention_log(v_run_id, 'person_claims', 'person_claims', 'deleted', v_ids);
        if v_enforce and array_length(v_ids, 1) is not null then
          delete from public.person_claims where id = any(v_ids);
        end if;
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'person_claims', 'person_claims', 'skipped', sqlerrm);
    end;

    -- M. Hours a volunteer logged themselves (#1296, #1165).
    --
    -- Only the entries that became nothing. A confirmed submission is the
    -- provenance of a volunteer_hours row -- the record that the volunteer
    -- entered those hours rather than a staffer entering them on their behalf
    -- -- so deleting it on a clock of its own would leave the ledger asserting
    -- something with nothing behind it. `status <> 'confirmed'` is therefore
    -- the predicate, not an age on every row; a confirmed entry whose ledger
    -- row was later deleted (the reference is on delete set null) stays too,
    -- because what it evidences is unchanged.
    --
    -- No audit-log residual here either: `notes` and `review_note` are in this
    -- table's redacted_columns (20260916090000), so the free text a volunteer
    -- wrote was never recorded in a snapshot to begin with.
    begin
      select period, mode into v_period, v_mode
        from public.retention_policies
       where policy_key = 'volunteer_hour_submissions' and tenant_id = v_tenant;
      v_enforce := not p_dry_run and v_mode = 'enforce';

      if v_mode = 'off' then
        perform public.retention_log(v_run_id, 'volunteer_hour_submissions', 'volunteer_hour_submissions', 'skipped', '{}');
      else
        v_ids := array(
          select s.id
            from public.volunteer_hour_submissions s
           where s.tenant_id = v_tenant
             and s.status <> 'confirmed'
             and s.updated_at < p_as_of - v_period
        );
        perform public.retention_log(v_run_id, 'volunteer_hour_submissions', 'volunteer_hour_submissions', 'deleted', v_ids);
        if v_enforce and array_length(v_ids, 1) is not null then
          delete from public.volunteer_hour_submissions where id = any(v_ids);
        end if;
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'volunteer_hour_submissions', 'volunteer_hour_submissions', 'skipped', sqlerrm);
    end;

    -- N, part two. The log line for the website-account rule, written once per
    -- tenant's run -- rule H's shape, and for its reason: a rule that appears
    -- in no run reads on the Data Retention page as a rule that was skipped.
    -- The count is the platform's, not this tenant's, and the page says so.
    --
    -- This tenant's own mode still decides what the line says: 'off' reports
    -- nothing rather than reporting a number this organization asked not to be
    -- shown a proposal for. It has already had its say in the unanimity test
    -- above, which is what stopped the delete.
    begin
      select mode into v_mode
        from public.retention_policies
       where policy_key = 'constituent_accounts' and tenant_id = v_tenant;

      if v_account_error is not null then
        v_failed := true;
        insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
        values (v_tenant, v_run_id, 'constituent_accounts', 'auth.users', 'skipped', v_account_error);
      elsif v_mode is null or v_mode = 'off' then
        perform public.retention_log(v_run_id, 'constituent_accounts', 'auth.users', 'skipped', '{}');
      else
        perform public.retention_log(v_run_id, 'constituent_accounts', 'auth.users', 'deleted', v_account_ids);
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'constituent_accounts', 'auth.users', 'skipped', sqlerrm);
    end;

    -- O. Volunteer screening outcomes (#1360).
    --
    -- coalesce(expires_on, cleared_on): a clearance that runs to 2032 is live
    -- until 2032, so the clock starts where the clearance ends, and falls back
    -- to the decision for one that never expires. The ::date cast is load
    -- bearing -- p_as_of is a timestamptz and both columns are date.
    --
    -- No audit-log residual to think about, and no redaction pass: this table
    -- has no free-text column, so the snapshot audit_log kept was already
    -- nothing but ids and dates.
    begin
      select period, mode into v_period, v_mode
        from public.retention_policies
       where policy_key = 'person_screenings' and tenant_id = v_tenant;
      v_enforce := not p_dry_run and v_mode = 'enforce';

      if v_mode = 'off' then
        perform public.retention_log(v_run_id, 'person_screenings', 'person_screenings', 'skipped', '{}');
      else
        v_ids := array(
          select s.id
            from public.person_screenings s
           where s.tenant_id = v_tenant
             and coalesce(s.expires_on, s.cleared_on) < (p_as_of - v_period)::date
        );
        perform public.retention_log(v_run_id, 'person_screenings', 'person_screenings', 'deleted', v_ids);
        if v_enforce and array_length(v_ids, 1) is not null then
          delete from public.person_screenings where id = any(v_ids);
        end if;
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'person_screenings', 'person_screenings', 'skipped', sqlerrm);
    end;

    update public.retention_runs
       set finished_at = now(),
           status = case when v_failed then 'partial' else 'succeeded' end
     where id = v_run_id;
  end loop;

  -- A single-tenant call answers with its run, which is what the portal needs
  -- to link straight to it. A sweep has no single run to name, and cron ignores
  -- the result.
  return v_result_run_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Self-check
-- ---------------------------------------------------------------------------

-- Every tenant has the new rule, and it is not enforcing on the day it ships.
-- A tenant missing it would be silently skipped; a tenant enforcing it would
-- delete on a period nobody approved.
do $check$
declare
  v_missing text;
begin
  select string_agg(t.slug, ', ') into v_missing
    from public.tenants t
    left join public.retention_policies p
      on p.tenant_id = t.id and p.policy_key = 'person_screenings'
   where p.policy_key is null;

  if v_missing is not null then
    raise exception 'tenants without the person_screenings retention rule: %', v_missing;
  end if;

  if exists (
    select 1 from public.retention_policies
     where policy_key = 'person_screenings' and mode <> 'dry_run'
  ) then
    raise exception 'the person_screenings retention rule must ship in dry_run';
  end if;
end;
$check$;
