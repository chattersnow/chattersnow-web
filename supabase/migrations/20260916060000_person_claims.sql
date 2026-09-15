-- Claiming a directory record (#1162, epic #1160).
--
-- An account and a `people` row are two different things. This is the bridge:
-- a signed-in person asks to be linked to their record, the system proposes
-- candidates, a staffer approves one, and only then does `people.auth_user_id`
-- get written.
--
-- Staff never see this. Their row already carries `auth_user_id`, written by
-- `ensure_current_person()` on their first portal sign-in. This is for the
-- donor, volunteer or attendee whose record the organization created *for*
-- them, who now has an account of their own.
--
-- ## The fence this is built beside, and does not replace
--
-- `resolve_current_person_id()` and `ensure_current_person()` both link an
-- account to a record by email match with no review. They are safe today
-- because both return null when `current_tenant_id()` is null, and
-- `current_tenant_id()` resolves through `tenant_memberships` -- which a
-- constituent does not have, because #1161 deliberately resolves their tenant
-- from the request host instead.
--
-- That safety is a consequence of a tenant-resolution decision rather than
-- anything either function promises, so it is pinned by an integration test
-- rather than left as a reading of the code. **A constituent must never
-- acquire a tenant membership.** If that ever changes, those two functions
-- become an auto-link path around everything below, and this table becomes
-- decorative.

-- ---------------------------------------------------------------------------
-- 1. Trigram matching
-- ---------------------------------------------------------------------------

-- Needed for the third matching tier: a name, compared loosely. Nothing in
-- this schema did fuzzy matching before -- find_duplicate_people() is exact
-- lowercased email and nothing else -- so the extension arrives with its first
-- caller.
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- 2. The claim
-- ---------------------------------------------------------------------------

create table public.person_claims (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) default public.default_tenant_id(),
  -- The account doing the asking. Not a foreign key to `people`: the whole
  -- point is that we do not yet know which person this is.
  auth_user_id uuid not null references auth.users(id),
  -- The record the claimant is asking for, where they picked one from what
  -- they were shown. Null is ordinary and means "I am new here" -- or that
  -- nothing was proposed, which the claimant cannot tell apart (see §4).
  claimed_person_id uuid,
  -- What the claimant says about themselves. Stored as typed, not normalized
  -- into `people`: it is evidence for a reviewer, and a claim that is refused
  -- must leave nothing behind in the directory.
  stated_name text not null check (length(btrim(stated_name)) > 0),
  stated_email text,
  stated_phone text,
  stated_instagram_handle text check (
    stated_instagram_handle is null
    or stated_instagram_handle ~ '^[A-Za-z0-9._]{1,30}$'
  ),
  note text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- set_updated_at() writes updated_by alongside updated_at, so a table
  -- carrying the trigger has to carry the column.
  updated_by uuid references auth.users(id),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  review_note text,
  constraint person_claims_person_in_tenant
    foreign key (tenant_id, claimed_person_id)
    references public.people (tenant_id, id) on delete set null,
  -- A decision names its author and its moment, or it is not a decision.
  constraint person_claims_reviewed_together check (
    (status in ('pending', 'withdrawn'))
    or (reviewed_by is not null and reviewed_at is not null)
  )
);

create trigger set_updated_at before update on public.person_claims
  for each row execute function public.set_updated_at();

-- One open claim per account per tenant, the shape pending_role_grants uses.
-- Partial, so a rejected claim does not block the person trying again after
-- they have spoken to somebody.
create unique index person_claims_one_pending
  on public.person_claims (tenant_id, auth_user_id)
  where status = 'pending';

create index person_claims_pending_idx
  on public.person_claims (tenant_id, created_at desc)
  where status = 'pending';

create index person_claims_claimed_person_idx
  on public.person_claims (claimed_person_id)
  where claimed_person_id is not null;

comment on table public.person_claims is
  'A request from a website account to be linked to a person in the directory (#1162). Reviewed by a holder of constituent_claims:manage; approval is the only path that writes people.auth_user_id for a constituent.';

alter table public.person_claims enable row level security;

-- The claimant: their own rows, and only while they are the subject of them.
-- Pinned to auth.uid() rather than to a person id, because an unlinked account
-- has no person id -- that is what it is asking for.
create policy "claimant reads own claims" on public.person_claims
  for select to authenticated
  using (auth_user_id = (select auth.uid()));

create policy "claimant opens own claim" on public.person_claims
  for insert to authenticated
  with check (
    auth_user_id = (select auth.uid())
    and status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
  );

-- Withdrawing is the only edit a claimant may make, and only to a claim that
-- is still open. Everything a reviewer touches is written by the definer RPC
-- below, which runs as owner and is not bound by these policies.
create policy "claimant withdraws own claim" on public.person_claims
  for update to authenticated
  using (auth_user_id = (select auth.uid()) and status = 'pending')
  with check (auth_user_id = (select auth.uid()) and status = 'withdrawn');

create policy "reviewers read claims" on public.person_claims
  for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('constituent_claims', 'view')
  );

grant select, insert, update on public.person_claims to authenticated;

-- Linking an account to a person's giving history is a decision someone made,
-- the same argument that makes public_team_members audited. The claimant's own
-- prose is redacted: audit_log is kept indefinitely and a note explaining who
-- you are is personal data on the same clock as a gear request's.
insert into public.audited_tables (table_name, pk_column, redacted_columns) values
  ('person_claims', 'id', array['note', 'stated_phone', 'review_note']);

create trigger audit_log_row after insert or update or delete on public.person_claims
  for each row execute function public.audit_log_row();

-- ---------------------------------------------------------------------------
-- 3. Candidate matching
-- ---------------------------------------------------------------------------

-- An Instagram handle as people actually give it: with an @, as a profile URL,
-- or bare. Returns null for anything that is not a handle once unwrapped, so a
-- caller can treat "nothing usable" and "not supplied" alike.
create function public.normalize_instagram_handle(p_input text)
returns text
language sql
immutable
as $$
  select nullif(
    regexp_replace(
      regexp_replace(
        lower(btrim(coalesce(p_input, ''))),
        '^(https?://)?(www\.)?instagram\.com/', ''
      ),
      '^@|/+$', '', 'g'
    ),
    ''
  )
$$;

comment on function public.normalize_instagram_handle(text) is
  'An Instagram handle from whatever a person typed: strips a profile URL, a leading @ and trailing slashes, lowercases. Null when nothing usable is left.';

-- The matcher. Ranked candidates for a human, never a decision.
--
-- Three tiers, strongest first, and a candidate is reported at the best tier
-- it reaches:
--
--   1. `email`     -- the claimant's *verified* address against people.email.
--   2. `instagram` -- often the only identifier on a record created from an
--                     event registration, which carries its own handle.
--   3. `name`      -- trigram similarity, and only when neither of the above
--                     hit. Always presented as "possible", never preselected.
--
-- Deliberately one function for all three so the tiers cannot drift apart, and
-- written to be reusable: find_duplicate_people() should grow onto this rather
-- than a second matcher being written beside it.
--
-- Definer, and gated: the whole point is that the *claimant* never learns
-- whether they matched (§4), so only a reviewer may run it. It takes the
-- claim rather than free text for the same reason -- a callable
-- "does this name exist here?" is an enumeration oracle over the directory
-- whatever its access rules say, so there is no such entry point.
create function public.person_claim_candidates(p_claim_id uuid)
returns table (
  person_id uuid,
  tier text,
  score real,
  name text,
  preferred_name text,
  email text,
  instagram_handle text,
  already_linked boolean
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_claim public.person_claims;
  v_verified_email text;
  v_handle text;
begin
  select * into v_claim
    from public.person_claims c
   where c.id = p_claim_id
     and c.tenant_id = public.current_tenant_id();

  if v_claim.id is null
     or not public.has_permission('constituent_claims', 'view') then
    return;
  end if;

  -- The address GoTrue has confirmed, not the one typed into the form. An
  -- unverified address is an assertion about somebody else's mailbox.
  select u.email into v_verified_email
    from auth.users u
   where u.id = v_claim.auth_user_id
     and u.email_confirmed_at is not null;

  v_handle := public.normalize_instagram_handle(v_claim.stated_instagram_handle);

  return query
  with scored as (
    select p.id,
           case
             when v_verified_email is not null
              and lower(p.email) = lower(v_verified_email) then 'email'
             when v_handle is not null
              and public.normalize_instagram_handle(p.instagram_handle) = v_handle
               then 'instagram'
             else 'name'
           end as tier,
           greatest(
             similarity(coalesce(p.name, ''), v_claim.stated_name),
             similarity(coalesce(p.preferred_name, ''), v_claim.stated_name)
           ) as name_score,
           p.name,
           p.preferred_name,
           p.email,
           p.instagram_handle,
           p.auth_user_id
      from public.people p
     where p.tenant_id = v_claim.tenant_id
       and not p.is_anonymous
       and (
         (v_verified_email is not null and lower(p.email) = lower(v_verified_email))
         or (v_handle is not null
             and public.normalize_instagram_handle(p.instagram_handle) = v_handle)
         or greatest(
              similarity(coalesce(p.name, ''), v_claim.stated_name),
              similarity(coalesce(p.preferred_name, ''), v_claim.stated_name)
            ) >= 0.45
       )
  )
  select s.id,
         s.tier,
         -- An exact identifier is 1; a name is however alike it is. One column
         -- so the queue can sort without knowing the tiers.
         case when s.tier = 'name' then s.name_score else 1::real end,
         s.name,
         s.preferred_name,
         s.email,
         s.instagram_handle,
         s.auth_user_id is not null
    from scored s
   order by case s.tier when 'email' then 0 when 'instagram' then 1 else 2 end,
            s.name_score desc nulls last,
            s.name
   limit 25;
end;
$$;

comment on function public.person_claim_candidates(uuid) is
  'Ranked directory records a claim might belong to (#1162): verified email, then Instagram handle, then trigram name similarity. For a reviewer only -- the claimant must never learn whether they matched.';

revoke execute on function public.person_claim_candidates(uuid) from public, anon;
grant execute on function public.person_claim_candidates(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Opening a claim
-- ---------------------------------------------------------------------------

-- The claimant's half. Returns nothing at all: no id, no count, no hint. The
-- page says the same sentence whether the address matched a donor, matched
-- nobody, or the account already had a claim open.
--
-- That silence is the whole security property. "We already have a record for
-- this address" answers "is this person a donor here?" for anyone who asks,
-- and the name tier would make it worse -- a response that varied would turn
-- the matcher into a search box over the directory.
create function public.submit_person_claim(
  p_name text,
  p_email text default null,
  p_phone text default null,
  p_instagram_handle text default null,
  p_note text default null,
  p_ip_address inet default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := public.public_tenant_id();
  v_user_id uuid := auth.uid();
begin
  -- The one thing this function *will* say out loud, and the only safe thing
  -- to say: that the caller is going too fast. It is a statement about their
  -- own behaviour, not about who is in the directory, so it can be an error
  -- where every other branch is silence. Without it the matcher runs on
  -- attacker-supplied input as fast as they can post, and even a matcher that
  -- answers nothing is work worth capping.
  if not public.check_rate_limit('submit_person_claim', p_ip_address, 5, interval '15 minutes') then
    raise exception 'RATE_LIMITED';
  end if;

  if v_user_id is null or v_tenant_id is null then
    return;
  end if;

  -- The module gate, checked here and not only on the page. `/my` 404s when a
  -- tenant has not enabled the area, but this RPC is reachable with curl and
  -- hiding a page has never been what stops a form post (#902). Silent like
  -- every other branch: a tenant's entitlements are not a claimant's business
  -- either.
  if not coalesce(
    (select tm.enabled from public.tenant_modules tm
      where tm.tenant_id = v_tenant_id
        and tm.module_key = 'constituent_accounts'),
    (select pm.enabled from public.plan_modules pm
      where pm.plan = (select t.plan from public.tenants t where t.id = v_tenant_id)
        and pm.module_key = 'constituent_accounts'),
    (select m.default_enabled from public.modules m
      where m.key = 'constituent_accounts'),
    false
  ) then
    return;
  end if;

  -- Already linked: nothing to claim. Silent, like every other branch.
  if exists (
    select 1 from public.people p
     where p.auth_user_id = v_user_id and p.tenant_id = v_tenant_id
  ) then
    return;
  end if;

  insert into public.person_claims (
    tenant_id, auth_user_id, stated_name, stated_email, stated_phone,
    stated_instagram_handle, note
  )
  values (
    v_tenant_id,
    v_user_id,
    btrim(p_name),
    nullif(btrim(coalesce(p_email, '')), ''),
    nullif(btrim(coalesce(p_phone, '')), ''),
    public.normalize_instagram_handle(p_instagram_handle),
    nullif(btrim(coalesce(p_note, '')), '')
  )
  on conflict (tenant_id, auth_user_id) where status = 'pending'
  do nothing;
end;
$$;

comment on function public.submit_person_claim(text, text, text, text, text, inet) is
  'Opens a claim for the signed-in account in the host''s tenant (#1162). Returns nothing in every case -- matched, unmatched, already claimed, already linked -- so the claimant cannot use it to ask whether an address or a name is in the directory.';

revoke execute on function public.submit_person_claim(text, text, text, text, text, inet) from public, anon;
grant execute on function public.submit_person_claim(text, text, text, text, text, inet) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Reviewing a claim
-- ---------------------------------------------------------------------------

-- The staffer's half, and the only thing that writes people.auth_user_id for a
-- constituent. One transaction, so a claim cannot be marked approved against a
-- link that did not happen.
--
-- Approving with no person creates one. That is the right answer for a genuine
-- newcomer, and it is why `claimed_person_id` is nullable: refusing to approve
-- without a match would push staff into attaching people to near-miss records
-- to get them through.
create function public.review_person_claim(
  p_claim_id uuid,
  p_approve boolean,
  p_person_id uuid default null,
  p_review_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim public.person_claims;
  v_tenant_id uuid := public.current_tenant_id();
  v_person_id uuid := p_person_id;
  v_existing uuid;
begin
  if not public.has_permission('constituent_claims', 'manage') then
    raise exception 'Not authorized';
  end if;

  select * into v_claim
    from public.person_claims c
   where c.id = p_claim_id
     and c.tenant_id = v_tenant_id
     for update;

  if v_claim.id is null then
    raise exception 'No such claim';
  end if;
  if v_claim.status <> 'pending' then
    raise exception 'This claim has already been %', v_claim.status;
  end if;

  if not p_approve then
    update public.person_claims
       set status = 'rejected',
           reviewed_by = auth.uid(),
           reviewed_at = now(),
           review_note = nullif(btrim(coalesce(p_review_note, '')), '')
     where id = p_claim_id;
    return null;
  end if;

  -- One account is one person per tenant, and one person is one account:
  -- people_auth_user_id_key enforces the first, and this check the second.
  -- Without it, approving a second claim against the same record would fail on
  -- the index with a message about a constraint rather than about the person.
  if v_person_id is not null then
    select p.auth_user_id into v_existing
      from public.people p
     where p.id = v_person_id and p.tenant_id = v_tenant_id;

    if not found then
      raise exception 'No such person in this organization';
    end if;
    if v_existing is not null and v_existing <> v_claim.auth_user_id then
      raise exception 'That record is already linked to a different account';
    end if;
  end if;

  if exists (
    select 1 from public.people p
     where p.auth_user_id = v_claim.auth_user_id and p.tenant_id = v_tenant_id
  ) then
    raise exception 'That account is already linked to a record';
  end if;

  if v_person_id is null then
    insert into public.people (
      tenant_id, name, is_anonymous, source_type, email, auth_user_id, created_by
    )
    values (
      v_tenant_id,
      v_claim.stated_name,
      false,
      'other',
      v_claim.stated_email,
      v_claim.auth_user_id,
      auth.uid()
    )
    returning id into v_person_id;
  else
    update public.people
       set auth_user_id = v_claim.auth_user_id
     where id = v_person_id;
  end if;

  update public.person_claims
     set status = 'approved',
         claimed_person_id = v_person_id,
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         review_note = nullif(btrim(coalesce(p_review_note, '')), '')
   where id = p_claim_id;

  return v_person_id;
end;
$$;

comment on function public.review_person_claim(uuid, boolean, uuid, text) is
  'Approve or reject a claim (#1162). Approving links people.auth_user_id, or creates a record when the claimant matched nobody, and marks the claim in the same transaction. Requires constituent_claims:manage.';

revoke execute on function public.review_person_claim(uuid, boolean, uuid, text) from public, anon;
grant execute on function public.review_person_claim(uuid, boolean, uuid, text) to authenticated;
