-- Claiming a record from the registration that just created it (#1258).
--
-- A registration is the moment somebody has told the organization who they
-- are. `submit_person_claim()` (20260916060000) already turns that assertion
-- into a reviewable claim -- but it takes the assertion from a form, and
-- somebody who has just registered has typed all of it once already. This is
-- the same claim, made from the registration row instead of a second form.
--
-- Everything that makes the claimant's half of #1162 safe is kept, because it
-- is the same half:
--
--   * It returns nothing. Matched, unmatched, already linked, already claimed,
--     module off, no such registration -- one silence for all of them, so the
--     offer after a registration cannot be used to ask whether an address is
--     in the directory any more than the form on `/my` can.
--   * It is rate-limited through check_rate_limit(), the only thing it will
--     say out loud, because that is a statement about the caller rather than
--     about the directory.
--   * It never writes `people.auth_user_id`. review_person_claim() remains the
--     only path that does (§5.23).
--
-- `claimed_person_id` stays null on purpose. The registration knows which
-- record it attached to, but the claimant never picked it from anything they
-- were shown, and a claim that named a record would be the application
-- deciding on self-asserted evidence -- which is the decision §5.23 reserves
-- for a reviewer. The reviewer gets there anyway: the verified address on the
-- account is `person_claim_candidates()`'s tier-1 evidence, so the record the
-- registration matched is normally the first candidate on the queue, ranked by
-- the same rule as every other claim.

create function public.submit_claim_from_registration(
  p_registration_id uuid,
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
  v_registration record;
begin
  -- Before anything else, as in submit_person_claim(): a caller posting these
  -- as fast as they can is worth capping even where every branch is silent.
  if not public.check_rate_limit('submit_claim_from_registration', p_ip_address, 5, interval '15 minutes') then
    raise exception 'RATE_LIMITED';
  end if;

  if v_user_id is null or v_tenant_id is null then
    return;
  end if;

  -- The module gate lives here and not only on the page, because a page has
  -- never been what stops a form post (#902). A tenant that has not enabled
  -- the constituent area has no `/my` to send anyone to, and the demo tenant
  -- never will (#1177).
  if not public.public_module_enabled('constituent_accounts') then
    return;
  end if;

  -- Already linked: there is nothing to claim. Silent, like every other
  -- branch -- though in practice the caller is not offered this at all, since
  -- a linked reader registers down `register_myself_for_event()`.
  if exists (
    select 1 from public.people p
     where p.auth_user_id = v_user_id and p.tenant_id = v_tenant_id
  ) then
    return;
  end if;

  -- The registration id is the evidence, and it is scoped two ways: to this
  -- host's tenant, and to a week. A day -- save_registrant_rider_profile()'s
  -- window -- is too short here, because the signed-out path runs through
  -- sign-up: with email confirmation on, the account does not exist until
  -- somebody opens their inbox, and the link they follow carries this id.
  -- A week is still short enough that a leaked id cannot be replayed at
  -- leisure, and the claim it opens is reviewed by a person either way.
  select r.name, r.email, r.phone, r.instagram_handle, e.name as event_name
    into v_registration
    from public.event_registrations r
    join public.events e
      on e.id = r.event_id and e.tenant_id = r.tenant_id
   where r.id = p_registration_id
     and r.tenant_id = v_tenant_id
     and r.created_at > now() - interval '7 days';

  -- `stated_name` must be non-blank, and nothing stops a registration row
  -- from holding a blank name -- the form requires one, the RPC behind it does
  -- not. A constraint violation here would be the one loud branch in a
  -- function whose whole design is silence, so it is checked rather than
  -- caught.
  if not found or btrim(coalesce(v_registration.name, '')) = '' then
    return;
  end if;

  -- Copied as typed, exactly as submit_person_claim() stores what somebody
  -- writes into the form: this is evidence for a reviewer, and a claim that is
  -- refused must leave nothing behind in the directory. The note says where it
  -- came from, which is the one thing the reviewer cannot see from the fields.
  insert into public.person_claims (
    tenant_id, auth_user_id, stated_name, stated_email, stated_phone,
    stated_instagram_handle, note
  )
  values (
    v_tenant_id,
    v_user_id,
    btrim(v_registration.name),
    nullif(btrim(coalesce(v_registration.email, '')), ''),
    nullif(btrim(coalesce(v_registration.phone, '')), ''),
    public.normalize_instagram_handle(v_registration.instagram_handle),
    'Registered for ' || v_registration.event_name || '.'
  )
  -- One pending claim per account per tenant. A second registration by
  -- somebody who already has one open gets the same silence, not an error.
  on conflict (tenant_id, auth_user_id) where status = 'pending'
  do nothing;
end;
$$;

comment on function public.submit_claim_from_registration(uuid, inet) is
  'Opens a claim from a recent event registration for the signed-in account in the host''s tenant (#1258). The registration''s stated fields are copied as typed. Returns nothing in every case, for the same reason submit_person_claim() does.';

revoke execute on function public.submit_claim_from_registration(uuid, inet) from public, anon;
grant execute on function public.submit_claim_from_registration(uuid, inet) to authenticated;
