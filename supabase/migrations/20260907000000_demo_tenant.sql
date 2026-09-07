-- #604 (was #707 Phase 5d): a demo tenant anyone can sign into from the
-- portal's login screen, reset nightly.
--
-- The demo account is not a parallel schema and not a special case in the
-- app: it is a tenant whose `plan` is 'demo', a value the tenants check
-- constraint has allowed since Phase 1 (20260905180000). Everything a visitor
-- sees is that tenant's own rows, kept apart by the same 262 policies and 106
-- composite foreign keys as any other tenant.
--
-- Two things this migration adds, and one it deliberately does not.
--
-- 1. seed_demo_tenant() -- the content. Not supabase/seed.sql, which cannot
--    be reused here for reasons that are properties of that file: it joins
--    user_roles to roles *by name across every tenant*, its final block sets
--    user_onboarding for every row of auth.users (against the hosted project
--    that silently completes every real user's tour), its created_by values
--    resolve to eight local @example.test accounts, and its fixture uuids are
--    global primary keys mirrored in test/seed-fixtures.ts.
--
--    So: every insert below names tenant_id explicitly -- no GUC, no host
--    header, no reliance on the column default -- and every created_by/actor
--    column takes p_actor_user_id rather than auth.uid(), which is null when
--    this runs as service_role from the reset job. Ids are gen_random_uuid(),
--    so nothing can collide with a fixture. The first statement refuses any
--    tenant whose plan is not 'demo', which is worth more than the rest of
--    the design: the function cannot be pointed at live data even by mistake.
--
-- 2. current_tenant_is_demo(), and the three controls it closes. A demo
--    visitor holds admin in the demo tenant *anonymously*, so any control
--    that still reaches outside the tenant becomes public the day it goes
--    live:
--
--      * pending_role_grants insert -- staging a grant is the front half of
--        the invite flow. #759 closed the takeover itself; refusing to stage
--        one at all in a demo tenant is defence in depth, and the app-side
--        block in createInviteLinkAction is the other half.
--      * grant_support_access / revoke_support_access -- its error taxonomy
--        (SUPPORT_USER_NOT_FOUND vs SUPPORT_USER_ALREADY_MEMBER) is an
--        account-existence oracle for arbitrary addresses, and a successful
--        grant hands a real account a membership that shows up in their
--        tenant switcher.
--      * deactivated_users insert -- the demo account's only membership is
--        the demo tenant, so user_is_only_in_current_tenant() is true for it
--        and a visitor could deactivate the demo account platform-wide until
--        the next nightly reset.
--
--    Not blocked, each checked deliberately: export (already
--    current_tenant_id()-scoped, and exporting demo data is worth showing
--    off); retention (#760 scoped set_retention_policy_mode and
--    trigger_retention_run per tenant, which is why it was a prerequisite);
--    tenant rename (the tenants update policy grants `name` only --
--    custom_domain, slug, status and plan are service_role, so a visitor
--    cannot claim a real domain).
--
-- 3. Two fixes the nightly reset ran straight into, neither of them specific
--    to the demo (sections 6 and 7). delete_tenant()'s pass loop only caught
--    foreign_key_violation, so an event with a linked donation stopped it
--    dead; and giveaway_prizes' composite bucket key nulls `giveaway_id` too,
--    which is not-null, so deleting a bucket raised. The demo is simply the
--    first tenant to hold that data *and* be deleted. Both are reachable from
--    the product today.
--
-- 4. What it does not add: any way to *create* the demo tenant. That is
--    provision_tenant(p_plan => 'demo') plus this function, driven by
--    scripts/demo-reset.ts, because re-asserting the demo account's password
--    is a GoTrue call and no migration or pg_cron job can make one.

-- 1. Is the caller's tenant a demo tenant? -----------------------------------

create or replace function public.current_tenant_is_demo()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select t.plan = 'demo'
       from public.tenants t
      where t.id = (select public.current_tenant_id())),
    false
  );
$$;

comment on function public.current_tenant_is_demo() is
  'Whether the caller''s current tenant is the public demo (plan = ''demo''). Its admin is an anonymous visitor, so a few controls that reach outside the tenant are refused there.';

grant execute on function public.current_tenant_is_demo() to authenticated;

-- 2. Staging a grant ---------------------------------------------------------

-- Rewrites only the INSERT policy from 20260906190000; reading, stamping and
-- deleting an already-staged grant are untouched, so a demo tenant that
-- somehow holds one can still be cleaned up.
drop policy "admin stages pending_role_grants" on public.pending_role_grants;

create policy "admin stages pending_role_grants" on public.pending_role_grants
  for insert to authenticated
  with check (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('administration', 'manage')
    and public.email_is_this_tenants_to_invite(email)
    and not public.current_tenant_is_demo()
  );

-- 3. Deactivating an account -------------------------------------------------

drop policy "admin deactivates own-tenant users" on public.deactivated_users;

create policy "admin deactivates own-tenant users" on public.deactivated_users
  for insert to authenticated
  with check (
    public.has_permission('administration', 'manage')
    and public.user_is_only_in_current_tenant(user_id)
    and not public.current_tenant_is_demo()
  );

-- 4. Support access ----------------------------------------------------------
--
-- Bodies are those of 20260906110000 with one guard added at the top of each,
-- placed before the address is looked up so the existence oracle never runs.

create or replace function public.grant_support_access(
  p_email text,
  p_reason text,
  p_expires_at timestamptz,
  p_role_name text default 'admin'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_user_id uuid;
  v_role_id uuid;
  v_membership_id uuid;
begin
  if v_tenant_id is null or not public.is_admin() then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if public.current_tenant_is_demo() then
    raise exception 'DEMO_TENANT_FORBIDS_SUPPORT_ACCESS' using errcode = '42501';
  end if;
  if public.current_membership_kind() <> 'member' then
    raise exception 'SUPPORT_CANNOT_GRANT_SUPPORT' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'SUPPORT_REASON_REQUIRED';
  end if;
  if p_expires_at is null or p_expires_at <= now() then
    raise exception 'SUPPORT_EXPIRY_MUST_BE_FUTURE';
  end if;
  if p_expires_at > now() + interval '90 days' then
    raise exception 'SUPPORT_EXPIRY_TOO_FAR';
  end if;

  select u.id into v_user_id
  from auth.users u
  where lower(u.email) = lower(btrim(p_email))
  limit 1;
  if v_user_id is null then
    raise exception 'SUPPORT_USER_NOT_FOUND';
  end if;
  if v_user_id = auth.uid() then
    raise exception 'SUPPORT_CANNOT_GRANT_SELF';
  end if;
  if exists (
    select 1 from public.tenant_memberships tm
    where tm.user_id = v_user_id and tm.tenant_id = v_tenant_id and tm.kind = 'member'
  ) then
    raise exception 'SUPPORT_USER_ALREADY_MEMBER';
  end if;

  select r.id into v_role_id
  from public.roles r
  where r.tenant_id = v_tenant_id and r.name = p_role_name;
  if v_role_id is null then
    raise exception 'SUPPORT_ROLE_NOT_FOUND';
  end if;

  insert into public.tenant_memberships (user_id, tenant_id, kind, expires_at, reason, created_by)
  values (v_user_id, v_tenant_id, 'support', p_expires_at, btrim(p_reason), auth.uid())
  on conflict (user_id, tenant_id) do update
    set expires_at = excluded.expires_at,
        reason = excluded.reason,
        created_by = excluded.created_by,
        created_at = now()
    where public.tenant_memberships.kind = 'support'
  returning id into v_membership_id;

  insert into public.user_roles (user_id, role_id, created_by)
  values (v_user_id, v_role_id, auth.uid())
  on conflict (user_id, role_id) do nothing;

  return v_membership_id;
end;
$$;

comment on function public.grant_support_access(text, text, timestamptz, text) is
  'Tenant admin grants an existing account a time-boxed (max 90 days) support membership plus a role in the current tenant. Refused to callers whose own membership is a support grant, and in the demo tenant.';

create or replace function public.revoke_support_access(p_membership_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_user_id uuid;
begin
  if v_tenant_id is null or not public.is_admin() then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if public.current_tenant_is_demo() then
    raise exception 'DEMO_TENANT_FORBIDS_SUPPORT_ACCESS' using errcode = '42501';
  end if;
  if public.current_membership_kind() <> 'member' then
    raise exception 'SUPPORT_CANNOT_REVOKE_SUPPORT' using errcode = '42501';
  end if;

  select tm.user_id into v_user_id
  from public.tenant_memberships tm
  where tm.id = p_membership_id
    and tm.tenant_id = v_tenant_id
    and tm.kind = 'support';
  if v_user_id is null then
    raise exception 'SUPPORT_GRANT_NOT_FOUND';
  end if;

  delete from public.user_roles ur
  where ur.user_id = v_user_id and ur.tenant_id = v_tenant_id;

  delete from public.user_tenant_selection s
  where s.user_id = v_user_id and s.tenant_id = v_tenant_id;

  delete from public.tenant_memberships tm
  where tm.id = p_membership_id;
end;
$$;

-- 5. The content -------------------------------------------------------------
--
-- Everything below is fabricated, the same rule supabase/seed.sql and
-- README.md state: no real person, organization, donation or recipient
-- appears here, and nothing in a demo tenant should ever be read as a record
-- of anything.
--
-- Dates are relative to now(), so a reset months from today still has a
-- season behind it and a season ahead of it rather than a wall of stale rows.

create or replace function public.seed_demo_tenant(
  p_tenant_id uuid,
  p_actor_user_id uuid,
  p_actor_person_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t uuid := p_tenant_id;
  actor uuid := p_actor_user_id;
  v_plan text;
  tz text := 'America/Denver';

  p_rowan uuid; p_sasha uuid; p_ines uuid; p_dee uuid; p_kai uuid;
  p_marisol uuid; p_theo uuid; p_nadia uuid; p_quinn uuid; p_priya uuid;
  p_outfitters uuid; p_resort uuid; p_fund uuid;

  pr_library uuid; pr_clinic uuid; pr_pass uuid;
  ev_opener uuid; ev_fitting uuid; ev_social uuid; ev_tour uuid;
  don_outfitters uuid; don_priya uuid;
  inv_board uuid; inv_jacket uuid; inv_helmet uuid; inv_goggles uuid;
  inv_boots uuid; inv_pants uuid; inv_gloves uuid; inv_ticket uuid;
  gv uuid; tier_general uuid; tier_premium uuid; bucket_general uuid;
  mtg_past uuid; mtg_next uuid;
  vrt_greeter uuid; vrt_fitter uuid; vrt_lead uuid;
begin
  -- The guard that matters. Everything after it writes rows, so this is what
  -- makes "the reset job pointed at the wrong tenant" a failed transaction
  -- rather than a mess inside somebody's live data.
  select tn.plan into v_plan from public.tenants tn where tn.id = t;
  if v_plan is null then
    raise exception 'DEMO_TENANT_NOT_FOUND: %', t;
  end if;
  if v_plan <> 'demo' then
    raise exception 'DEMO_TENANT_REQUIRED: tenant % has plan %', t, v_plan;
  end if;

  -- auth.uid() is null here: this runs as service_role from a script with no
  -- session, and every created_by below is not-null.
  if p_actor_user_id is null or p_actor_person_id is null then
    raise exception 'DEMO_SEED_ACTOR_REQUIRED';
  end if;

  -- Seeding twice would double every list in the portal, and the reset job
  -- always builds a fresh tenant, so a second call is a mistake, not a
  -- refresh.
  if exists (select 1 from public.events e where e.tenant_id = t) then
    raise exception 'DEMO_TENANT_ALREADY_SEEDED: %', t;
  end if;

  -- Volunteer roles ----------------------------------------------------------
  insert into public.volunteer_role_types (tenant_id, name, description, is_public, created_by)
  values (t, 'Event greeter', 'Welcomes people at the door and runs the sign-in table.', true, actor)
  returning id into vrt_greeter;
  insert into public.volunteer_role_types (tenant_id, name, description, is_public, created_by)
  values (t, 'Gear fitter', 'Sizes boots, boards and outerwear at gear nights.', true, actor)
  returning id into vrt_fitter;
  insert into public.volunteer_role_types (tenant_id, name, description, is_public, created_by)
  values (t, 'Ride lead', 'Leads a group on the hill and keeps everyone together.', false, actor)
  returning id into vrt_lead;

  -- Programs -----------------------------------------------------------------
  insert into public.programs (tenant_id, name, description, status, created_by)
  values (t, 'Gear Library', 'Donated outerwear and hardgoods, lent out for a season at no cost.', 'active', actor)
  returning id into pr_library;
  insert into public.programs (tenant_id, name, description, status, created_by)
  values (t, 'First Turns', 'A beginner day on the hill: lesson, rental and a lift ticket, covered.', 'active', actor)
  returning id into pr_clinic;
  insert into public.programs (tenant_id, name, description, status, created_by)
  values (t, 'Season Pass Fund', 'Piloting a small number of subsidised season passes.', 'pilot', actor)
  returning id into pr_pass;

  -- People -------------------------------------------------------------------
  insert into public.people (tenant_id, name, source_type, person_type, email, pronouns, notes, created_by)
  values (t, 'Rowan Adeyemi', 'individual', 'individual', 'rowan@demo.invalid', 'they/them', 'Board chair. Invented for the demo.', actor)
  returning id into p_rowan;
  insert into public.people (tenant_id, name, source_type, person_type, email, pronouns, notes, created_by)
  values (t, 'Sasha Petrova', 'individual', 'individual', 'sasha@demo.invalid', 'she/her', 'Treasurer. Invented for the demo.', actor)
  returning id into p_sasha;
  insert into public.people (tenant_id, name, source_type, person_type, email, pronouns, notes, created_by)
  values (t, 'Ines Okafor', 'individual', 'individual', 'ines@demo.invalid', 'she/her', 'Secretary. Invented for the demo.', actor)
  returning id into p_ines;
  insert into public.people (tenant_id, name, source_type, person_type, email, pronouns, riding_discipline, snowboard_experience_level, created_by)
  values (t, 'Dee Halvorsen', 'individual', 'individual', 'dee@demo.invalid', 'she/her', 'snowboard', 'advanced', actor)
  returning id into p_dee;
  insert into public.people (tenant_id, name, source_type, person_type, email, pronouns, riding_discipline, ski_experience_level, created_by)
  values (t, 'Kai Otsuka', 'individual', 'individual', 'kai@demo.invalid', 'he/him', 'ski', 'advanced', actor)
  returning id into p_kai;
  insert into public.people (tenant_id, name, source_type, person_type, email, pronouns, riding_discipline, snowboard_experience_level, created_by)
  values (t, 'Marisol Vega', 'individual', 'individual', 'marisol@demo.invalid', 'she/her', 'snowboard', 'beginner', actor)
  returning id into p_marisol;
  insert into public.people (tenant_id, name, source_type, person_type, email, pronouns, riding_discipline, ski_experience_level, created_by)
  values (t, 'Theo Brandt', 'individual', 'individual', 'theo@demo.invalid', 'he/him', 'ski', 'beginner', actor)
  returning id into p_theo;
  insert into public.people (tenant_id, name, source_type, person_type, email, pronouns, riding_discipline, ski_experience_level, snowboard_experience_level, created_by)
  values (t, 'Nadia Rahmani', 'individual', 'individual', 'nadia@demo.invalid', 'she/her', 'both', 'intermediate', 'beginner', actor)
  returning id into p_nadia;
  insert into public.people (tenant_id, name, source_type, person_type, email, pronouns, created_by)
  values (t, 'Quinn Sorensen', 'individual', 'individual', 'quinn@demo.invalid', 'they/them', actor)
  returning id into p_quinn;
  insert into public.people (tenant_id, name, source_type, person_type, email, created_by)
  values (t, 'Priya Raman', 'individual', 'individual', 'priya@demo.invalid', actor)
  returning id into p_priya;
  insert into public.people (tenant_id, name, source_type, person_type, email, website, notes, created_by)
  values (t, 'Northfork Outfitters', 'brand', 'organization', 'hello@demo.invalid', 'https://example.invalid', 'Gear donor. Invented for the demo.', actor)
  returning id into p_outfitters;
  insert into public.people (tenant_id, name, source_type, person_type, email, website, notes, created_by)
  values (t, 'Cedar Ridge Resort', 'organization', 'organization', 'partners@demo.invalid', 'https://example.invalid', 'Lift tickets and space. Invented for the demo.', actor)
  returning id into p_resort;
  insert into public.people (tenant_id, name, source_type, person_type, email, notes, created_by)
  values (t, 'Basin Community Fund', 'organization', 'organization', 'grants@demo.invalid', 'Small operating grant. Invented for the demo.', actor)
  returning id into p_fund;

  insert into public.person_role_tags (tenant_id, person_id, role, granted_by)
  values
    (t, p_rowan, 'staff', actor),
    (t, p_sasha, 'staff', actor),
    (t, p_ines, 'staff', actor),
    (t, p_dee, 'volunteer', actor),
    (t, p_kai, 'volunteer', actor),
    (t, p_marisol, 'attendee', actor),
    (t, p_theo, 'attendee', actor),
    (t, p_nadia, 'attendee', actor),
    (t, p_quinn, 'attendee', actor),
    (t, p_priya, 'donor', actor),
    (t, p_outfitters, 'donor', actor),
    (t, p_resort, 'sponsor', actor),
    (t, p_fund, 'partner', actor);

  insert into public.board_members (tenant_id, person_id, role_title, term_start, term_end, is_active, created_by)
  values
    (t, p_rowan, 'Chair', (now() - interval '14 months')::date, (now() + interval '10 months')::date, true, actor),
    (t, p_sasha, 'Treasurer', (now() - interval '14 months')::date, (now() + interval '10 months')::date, true, actor),
    (t, p_ines, 'Secretary', (now() - interval '2 months')::date, (now() + interval '22 months')::date, true, actor);

  -- Events -------------------------------------------------------------------
  insert into public.events (
    tenant_id, name, location, starts_at, ends_at, timezone, visibility, status,
    description, capacity, registration_enabled, attendance_count, budget_amount,
    event_lead_id, report_status, report_summary, lessons_learned,
    report_submitted_at, report_submitted_by, created_by
  )
  values (
    t, 'Season Opener Ride Day', 'Cedar Ridge Resort',
    now() - interval '42 days', now() - interval '42 days' + interval '8 hours', tz,
    'public', 'completed',
    'First group day of the season. Meet at the base area, ride in ability groups, eat together after.',
    60, true, 47, 2400.00, p_dee,
    'submitted',
    'Forty-seven people came out, twenty-two of them new to us. Ability groups worked; the sign-in table did not.',
    'Two greeters at the door next time, and print the roster the night before rather than the morning of.',
    now() - interval '35 days', actor, actor
  )
  returning id into ev_opener;

  insert into public.events (
    tenant_id, name, location, starts_at, ends_at, timezone, visibility, status,
    description, capacity, registration_enabled, registration_deadline,
    budget_amount, event_lead_id, created_by
  )
  values (
    t, 'Beginner Gear Fitting Night', 'Community room, second floor',
    now() + interval '19 days', now() + interval '19 days' + interval '3 hours', tz,
    'public', 'published',
    'Get fitted for boots, a board or skis, and outerwear from the gear library. No experience needed.',
    40, true, now() + interval '17 days', 600.00, p_kai, actor
  )
  returning id into ev_fitting;

  insert into public.events (
    tenant_id, name, location, starts_at, ends_at, timezone, visibility, status,
    description, capacity, registration_enabled, budget_amount, event_lead_id, created_by
  )
  values (
    t, 'Midwinter Social and Giveaway', 'The Annex',
    now() + interval '48 days', now() + interval '48 days' + interval '4 hours', tz,
    'public', 'published',
    'The one fundraiser of the season: food, a slideshow of the year so far, and a gear giveaway.',
    120, true, 1800.00, p_rowan, actor
  )
  returning id into ev_social;

  insert into public.events (
    tenant_id, name, starts_at, ends_at, timezone, visibility, status, description, created_by
  )
  values (
    t, 'Spring Splitboard Tour', now() + interval '96 days', now() + interval '96 days' + interval '9 hours', tz,
    'private', 'draft',
    'Still being scoped: the avalanche-safety requirement, group size and a backup date are all undecided.', actor
  )
  returning id into ev_tour;

  insert into public.event_programs (tenant_id, event_id, program_id)
  values
    (t, ev_opener, pr_clinic),
    (t, ev_fitting, pr_library),
    (t, ev_social, pr_pass),
    (t, ev_tour, pr_clinic);

  -- Registrations, checked in on the day that has already happened -----------
  insert into public.event_registrations (tenant_id, event_id, person_id, name, email, party_size, pronouns, checked_in_at, created_at)
  values
    (t, ev_opener, p_marisol, 'Marisol Vega', 'marisol@demo.invalid', 1, 'she/her', now() - interval '42 days' + interval '30 minutes', now() - interval '55 days'),
    (t, ev_opener, p_theo, 'Theo Brandt', 'theo@demo.invalid', 2, 'he/him', now() - interval '42 days' + interval '35 minutes', now() - interval '54 days'),
    (t, ev_opener, p_nadia, 'Nadia Rahmani', 'nadia@demo.invalid', 1, 'she/her', now() - interval '42 days' + interval '52 minutes', now() - interval '50 days'),
    (t, ev_opener, p_quinn, 'Quinn Sorensen', 'quinn@demo.invalid', 1, 'they/them', null, now() - interval '48 days'),
    (t, ev_opener, p_dee, 'Dee Halvorsen', 'dee@demo.invalid', 1, 'she/her', now() - interval '42 days' + interval '10 minutes', now() - interval '60 days');

  insert into public.event_registrations (tenant_id, event_id, person_id, name, email, party_size, pronouns, notes, created_at)
  values
    (t, ev_fitting, p_marisol, 'Marisol Vega', 'marisol@demo.invalid', 1, 'she/her', 'Needs boots, size 8.', now() - interval '6 days'),
    (t, ev_fitting, p_theo, 'Theo Brandt', 'theo@demo.invalid', 1, 'he/him', null, now() - interval '4 days'),
    (t, ev_fitting, p_quinn, 'Quinn Sorensen', 'quinn@demo.invalid', 2, 'they/them', 'Bringing a friend who is also new.', now() - interval '2 days');

  -- Donated gear, and where it went ------------------------------------------
  insert into public.donations (tenant_id, donor_id, donated_at, notes, created_by)
  values (t, p_outfitters, now() - interval '75 days', 'End-of-line stock from the shop. Invented for the demo.', actor)
  returning id into don_outfitters;
  insert into public.donations (tenant_id, donor_id, donated_at, notes, created_by)
  values (t, p_priya, now() - interval '30 days', 'Outgrown kids'' outerwear.', actor)
  returning id into don_priya;

  insert into public.inventory_items (tenant_id, donation_id, description, type, size, gender, condition, face_value, status, intended_use, created_by)
  values (t, don_outfitters, 'All-mountain snowboard, 152cm', 'snowboard', '152', 'unisex', 'like_new', 380.00, 'available', 'gear_library', actor)
  returning id into inv_board;
  insert into public.inventory_items (tenant_id, donation_id, description, type, size, gender, condition, face_value, status, intended_use, created_by)
  values (t, don_outfitters, 'Insulated shell jacket', 'jacket', 'M', 'unisex', 'new', 220.00, 'distributed', 'gear_library', actor)
  returning id into inv_jacket;
  insert into public.inventory_items (tenant_id, donation_id, description, type, size, condition, face_value, status, intended_use, created_by)
  values (t, don_outfitters, 'Snow helmet with adjustable fit', 'helmet', 'M', 'good', 90.00, 'available', 'gear_library', actor)
  returning id into inv_helmet;
  insert into public.inventory_items (tenant_id, donation_id, description, type, condition, face_value, status, intended_use, created_by)
  values (t, don_outfitters, 'Low-light goggles', 'goggles', 'new', 140.00, 'available', 'giveaway', actor)
  returning id into inv_goggles;
  insert into public.inventory_items (tenant_id, donation_id, description, type, condition, face_value, status, intended_use, notes, created_by)
  values (t, don_outfitters, 'Day lift ticket', 'lift_ticket', 'new', 129.00, 'available', 'giveaway', 'Donated by the resort for the midwinter social.', actor)
  returning id into inv_ticket;
  insert into public.inventory_items (tenant_id, donation_id, description, type, size, gender, condition, face_value, status, intended_use, created_by)
  values (t, don_priya, 'Snowboard boots', 'boots', '8', 'women', 'good', 160.00, 'reserved', 'gear_library', actor)
  returning id into inv_boots;
  insert into public.inventory_items (tenant_id, donation_id, description, type, size, gender, condition, face_value, status, intended_use, created_by)
  values (t, don_priya, 'Snow pants', 'pants', 'YL', 'kids', 'fair', 70.00, 'available', 'gear_library', actor)
  returning id into inv_pants;
  insert into public.inventory_items (tenant_id, donation_id, description, type, gender, condition, face_value, status, intended_use, created_by)
  values (t, don_priya, 'Waterproof mittens', 'gloves', 'kids', 'like_new', 45.00, 'available', 'gear_library', actor)
  returning id into inv_gloves;

  insert into public.inventory_movements (tenant_id, inventory_item_id, movement_type, occurred_at, reason, event_id, recipient_person_id, created_by)
  values
    (t, inv_board, 'received', now() - interval '75 days', 'Shop donation intake', null, null, actor),
    (t, inv_jacket, 'received', now() - interval '75 days', 'Shop donation intake', null, null, actor),
    (t, inv_helmet, 'received', now() - interval '75 days', 'Shop donation intake', null, null, actor),
    (t, inv_goggles, 'received', now() - interval '75 days', 'Shop donation intake', null, null, actor),
    (t, inv_ticket, 'received', now() - interval '70 days', 'Resort partnership', null, null, actor),
    (t, inv_boots, 'received', now() - interval '30 days', 'Individual donation intake', null, null, actor),
    (t, inv_pants, 'received', now() - interval '30 days', 'Individual donation intake', null, null, actor),
    (t, inv_gloves, 'received', now() - interval '30 days', 'Individual donation intake', null, null, actor),
    (t, inv_jacket, 'distributed', now() - interval '42 days', 'Season loan', ev_opener, p_marisol, actor),
    (t, inv_boots, 'reserved', now() - interval '5 days', 'Held for gear fitting night', ev_fitting, p_theo, actor);

  -- Money in ------------------------------------------------------------------
  insert into public.monetary_donations (tenant_id, donor_id, event_id, amount, method, received_date, notes, created_by)
  values
    (t, p_priya, null, 250.00, 'online', (now() - interval '60 days')::date, 'Recurring monthly gift.', actor),
    (t, p_fund, null, 5000.00, 'check', (now() - interval '90 days')::date, 'Operating grant, first of two payments.', actor),
    (t, p_priya, null, 250.00, 'online', (now() - interval '30 days')::date, 'Recurring monthly gift.', actor),
    (t, p_resort, ev_opener, 400.00, 'bank_transfer', (now() - interval '40 days')::date, 'Sponsorship of the opener.', actor);

  insert into public.event_revenue (tenant_id, event_id, source, amount, received_date, notes, created_by)
  values
    (t, ev_opener, 'registration_fees', 235.00, (now() - interval '42 days')::date, 'Sliding-scale contributions at the door.', actor),
    (t, ev_opener, 'onsite_donations', 118.00, (now() - interval '42 days')::date, null, actor),
    (t, ev_social, 'grants', 1000.00, (now() - interval '10 days')::date, 'Restricted to the social.', actor);

  -- Money out, one row at each approval state ---------------------------------
  insert into public.event_expenses (tenant_id, event_id, description, expense_date, amount, status, submitted_by, approved_by, approved_at, paid_by, paid_at, paid_by_person_id, notes, created_by)
  values (t, ev_opener, 'Group lift tickets (12)', (now() - interval '43 days')::date, 720.00, 'paid', actor, actor, now() - interval '41 days', actor, now() - interval '38 days', p_sasha, 'Discounted group rate.', actor);
  insert into public.event_expenses (tenant_id, event_id, description, expense_date, amount, status, submitted_by, approved_by, approved_at, created_by)
  values (t, ev_opener, 'Lunch for volunteers', (now() - interval '42 days')::date, 145.50, 'approved', actor, actor, now() - interval '40 days', actor);
  insert into public.event_expenses (tenant_id, event_id, description, expense_date, amount, status, submitted_by, notes, created_by)
  values (t, ev_fitting, 'Boot-fitting supplies', (now() - interval '3 days')::date, 89.20, 'submitted', actor, 'Waiting on the treasurer.', actor);
  insert into public.event_expenses (tenant_id, event_id, description, expense_date, amount, status, submitted_by, rejected_by, rejected_at, rejection_reason, created_by)
  values (t, ev_social, 'Photo booth rental', (now() - interval '8 days')::date, 450.00, 'rejected', actor, actor, now() - interval '6 days', 'Over the social''s budget; revisit next season.', actor);

  insert into public.event_sponsors (tenant_id, event_id, person_id, support_type, in_kind_description, contribution_value, is_public, follow_up_status, created_by)
  values
    (t, ev_opener, p_resort, 'in_kind', 'Base-area meeting space and discounted group tickets.', 900.00, true, 'done', actor),
    (t, ev_social, p_outfitters, 'in_kind', 'Giveaway prizes.', 650.00, true, 'in_progress', actor);

  -- The giveaway at the social ------------------------------------------------
  insert into public.giveaways (tenant_id, event_id, name, tickets_sold, ticket_price, revenue_amount, drawing_date, notes, created_by)
  values (t, ev_social, 'Midwinter gear giveaway', 0, 5.00, 0, now() + interval '48 days' + interval '3 hours', 'Tickets at the door; the premium tier is for anyone who brings a gear donation.', actor)
  returning id into gv;

  insert into public.giveaway_tiers (tenant_id, giveaway_id, key, label, rank, created_by)
  values (t, gv, 'general', 'General', 1, actor)
  returning id into tier_general;
  insert into public.giveaway_tiers (tenant_id, giveaway_id, key, label, rank, created_by)
  values (t, gv, 'premium', 'Premium', 2, actor)
  returning id into tier_premium;

  insert into public.giveaway_tier_rules (tenant_id, giveaway_id, tier_id, match_text, created_by)
  values
    (t, gv, tier_general, 'door', actor),
    (t, gv, tier_premium, 'donation', actor);

  insert into public.giveaway_buckets (tenant_id, giveaway_id, tier_id, name, rank, created_by)
  values (t, gv, tier_general, 'Everyday gear', 1, actor)
  returning id into bucket_general;

  insert into public.giveaway_prizes (tenant_id, giveaway_id, prize_name, estimated_value, donor_person_id, source_inventory_item_id, bucket_id, created_by)
  values
    (t, gv, 'Low-light goggles', 140.00, p_outfitters, inv_goggles, bucket_general, actor),
    (t, gv, 'Day lift ticket', 129.00, p_resort, inv_ticket, bucket_general, actor);

  -- Community calendar --------------------------------------------------------
  insert into public.calendar_items (tenant_id, title, item_type, starts_at, ends_at, time_zone, summary, priority_tier, calendar_status, visibility, owner_id, created_by)
  values
    (t, 'Midwinter Social and Giveaway', 'chatter_event', now() + interval '48 days', now() + interval '48 days' + interval '4 hours', tz, 'The fundraiser. Content push starts three weeks out.', 1, 'active', 'public', p_rowan, actor),
    (t, 'Gear drive with Northfork Outfitters', 'partner_event', now() + interval '26 days', now() + interval '26 days' + interval '6 hours', tz, 'Drop-off bins in the shop for a week; we collect on the Saturday.', 2, 'active', 'public', p_ines, actor),
    (t, 'Beginner-season content push', 'content_campaign', now() + interval '12 days', now() + interval '33 days', tz, 'Three posts: what to wear, what the gear library lends, how First Turns works.', 2, 'idea', 'internal', p_ines, actor),
    (t, 'End-of-season thank-yous', 'content_campaign', now() + interval '110 days', null, tz, 'Donor and volunteer thank-yous once the season closes.', 3, 'idea', 'internal', null, actor);

  -- Governance ----------------------------------------------------------------
  insert into public.governance_meetings (tenant_id, meeting_date, meeting_type, status, location, notes, facilitator_person_id, notetaker_person_id, minutes_approved_at, minutes_approved_by, created_by)
  values (t, now() - interval '21 days', 'board', 'completed', 'Community room', 'Quorum met. Minutes approved at the following meeting.', p_rowan, p_ines, now() - interval '2 days', actor, actor)
  returning id into mtg_past;

  insert into public.governance_meetings (tenant_id, meeting_date, meeting_type, status, location, facilitator_person_id, created_by)
  values (t, now() + interval '9 days', 'board', 'scheduled', 'Community room', p_rowan, actor)
  returning id into mtg_next;

  insert into public.governance_meeting_attendees (tenant_id, meeting_id, person_id, attended, created_by)
  values
    (t, mtg_past, p_rowan, true, actor),
    (t, mtg_past, p_sasha, true, actor),
    (t, mtg_past, p_ines, true, actor);

  insert into public.agendas (tenant_id, meeting_id, body_text, new_business, parking_lot, next_meeting_date, next_meeting_topics, created_by)
  values (
    t, mtg_past,
    'Standing items: finance report, gear library numbers, upcoming events.',
    '[{"title": "Midwinter social budget", "notes": "Approved at 1,800."}, {"title": "Season pass pilot", "notes": "Three passes this season; review in spring."}]'::jsonb,
    '[{"title": "Insurance renewal"}, {"title": "Storage unit lease"}]'::jsonb,
    (now() + interval '9 days')::date,
    'Gear drive logistics, spring tour go/no-go.',
    actor
  );

  insert into public.governance_meeting_action_items (tenant_id, meeting_id, description, owner_person_id, due_date, status, created_by)
  values
    (t, mtg_past, 'Confirm the resort''s donation of lift tickets for the giveaway.', p_rowan, (now() + interval '5 days')::date, 'open', actor),
    (t, mtg_past, 'Circulate the draft budget before the next meeting.', p_sasha, (now() + interval '7 days')::date, 'open', actor),
    (t, mtg_past, 'Post the approved minutes to the shared drive.', p_ines, (now() - interval '10 days')::date, 'done', actor);

  -- Volunteers ----------------------------------------------------------------
  insert into public.volunteer_applications (tenant_id, person_id, name, email, phone, role_interest, availability, status, pronouns, reference_code, created_at)
  values
    (t, p_dee, 'Dee Halvorsen', 'dee@demo.invalid', '555-0100', 'Ride lead', 'Most weekends through March.', 'placed', 'she/her', public.generate_volunteer_reference_code(t), now() - interval '120 days'),
    (t, p_kai, 'Kai Otsuka', 'kai@demo.invalid', null, 'Gear fitter', 'Weekday evenings.', 'contacted', 'he/him', public.generate_volunteer_reference_code(t), now() - interval '25 days'),
    (t, p_quinn, 'Quinn Sorensen', 'quinn@demo.invalid', null, 'Event greeter', 'Whenever there is an event.', 'new', 'they/them', public.generate_volunteer_reference_code(t), now() - interval '3 days');

  insert into public.volunteer_hours (tenant_id, person_id, event_id, volunteer_role_type_id, hours, logged_date, notes, logged_by)
  values
    (t, p_dee, ev_opener, vrt_lead, 8.00, (now() - interval '42 days')::date, 'Led the intermediate group.', actor),
    (t, p_kai, ev_opener, vrt_greeter, 4.50, (now() - interval '42 days')::date, null, actor),
    (t, p_dee, null, vrt_fitter, 3.00, (now() - interval '20 days')::date, 'Sorting the gear library.', actor),
    (t, p_quinn, null, vrt_greeter, 2.00, (now() - interval '9 days')::date, 'Helped with the mailing.', actor);

  -- Inbox ---------------------------------------------------------------------
  insert into public.contact_messages (tenant_id, name, email, topic, message, status, created_at)
  values
    (t, 'Alex Moreno', 'alex@demo.invalid', 'Gear', 'Do you have kids'' outerwear? My nephew is starting this winter and has outgrown everything.', 'new', now() - interval '2 days'),
    (t, 'Sam Whitfield', 'sam@demo.invalid', 'Volunteering', 'I ski most weekends and would like to help out. What do you need?', 'read', now() - interval '11 days'),
    (t, 'Jordan Pike', 'jordan@demo.invalid', 'Partnership', 'We run a shop on the north side and would like to talk about a gear drive.', 'resolved', now() - interval '40 days');

  -- Settings, branding and the public site ------------------------------------
  insert into public.app_settings (tenant_id, key, value, updated_by)
  values
    (t, 'page_visibility.programs', 'true'::jsonb, actor),
    (t, 'page_visibility.learn', 'true'::jsonb, actor),
    (t, 'page_visibility.support', 'true'::jsonb, actor),
    (t, 'brand.primary', '"#1f6f8b"'::jsonb, actor),
    (t, 'brand.primary_deep', '"#10333f"'::jsonb, actor),
    (t, 'brand.primary_soft', '"#dceef4"'::jsonb, actor),
    (t, 'brand.background', '"#f2f9fb"'::jsonb, actor)
  on conflict (tenant_id, key) do update
    set value = excluded.value, updated_by = excluded.updated_by;

  insert into public.site_content (tenant_id, key, value, updated_by)
  values
    (t, 'org.short_name', '"the demo org"'::jsonb, actor),
    (t, 'org.tagline', '"A demonstration organization. Every name, number and record here is invented."'::jsonb, actor),
    (t, 'org.email_general', '"hello@demo.invalid"'::jsonb, actor),
    (t, 'home.heading', '"A demo of the operations portal"'::jsonb, actor),
    (t, 'home.intro', '"This is a sample organization used to show the portal. Nothing here is real: no person, donation or record on this site describes anybody."'::jsonb, actor)
  on conflict (tenant_id, key) do update
    set value = excluded.value, updated_by = excluded.updated_by;

  return jsonb_build_object(
    'tenant_id', t,
    'people', (select count(*) from public.people where tenant_id = t),
    'events', (select count(*) from public.events where tenant_id = t),
    'inventory_items', (select count(*) from public.inventory_items where tenant_id = t),
    'registrations', (select count(*) from public.event_registrations where tenant_id = t)
  );
end;
$$;

comment on function public.seed_demo_tenant(uuid, uuid, uuid) is
  'Fills a plan = ''demo'' tenant with fabricated demonstration content. Refuses any other tenant, and refuses one that already has events. Every insert names tenant_id and takes its actor from the arguments, so it is correct under service_role with no session. service_role only.';

revoke execute on function public.seed_demo_tenant(uuid, uuid, uuid) from public;
grant execute on function public.seed_demo_tenant(uuid, uuid, uuid) to service_role;

-- The same self-check 20260906100000 runs, because this migration rewrote two
-- policies on tenant tables.
do $$
declare
  v_gaps text;
begin
  select string_agg('policy ' || p.tablename || '."' || p.policyname || '"', ', ')
  into v_gaps
  from pg_policies p
  where p.schemaname = 'public'
    and p.tablename = 'pending_role_grants'
    and coalesce(p.qual, '') || coalesce(p.with_check, '') not like '%current_tenant_id%';

  if v_gaps is not null then
    raise exception 'pending_role_grants policies without a tenant predicate: %', v_gaps;
  end if;
end $$;

-- 6. delete_tenant() has to survive a tenant that actually used the product --
--
-- The nightly reset archives the old demo tenant and calls delete_tenant().
-- That failed on the very first seeded tenant, and the reason is not specific
-- to the demo: `prevent_event_delete_with_records` (20260828140000) refuses to
-- delete an event that still has a linked donation, movement or volunteer-hours
-- entry, and it raises `restrict_violation` -- which the pass loop below did
-- not catch, because it only ever expected `foreign_key_violation`.
--
-- The loop's design already has the right answer: defer the table and try
-- again once its children are gone. Those children (monetary_donations,
-- inventory_movements, volunteer_hours) are themselves tenant tables and go in
-- the first pass, so events succeeds on the second. The "a pass that removed
-- nothing is an error" check still stands, so a table that genuinely cannot be
-- cleared still fails loudly rather than leaving a half-deleted tenant.
--
-- The message now carries the last error, because "TENANT_DELETE_BLOCKED:
-- events" on its own sent whoever hit this to read three triggers.
create or replace function public.delete_tenant(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_remaining text[];
  v_next text[];
  v_table text;
  v_pass integer := 0;
  v_count bigint;
  v_counts jsonb := '{}'::jsonb;
  v_last_error text;
begin
  select t.status into v_status from public.tenants t where t.id = p_tenant_id;
  if v_status is null then
    raise exception 'TENANT_NOT_FOUND';
  end if;
  if v_status <> 'archived' then
    raise exception 'TENANT_NOT_ARCHIVED';
  end if;

  select coalesce(array_agg(c.relname::text order by c.relname), '{}')
  into v_remaining
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid and a.attname = 'tenant_id' and not a.attisdropped
  where n.nspname = 'public' and c.relkind = 'r';

  -- Each pass deletes what it can; a table whose rows are still referenced by
  -- another tenant table -- by a foreign key, or by a trigger that refuses the
  -- delete while children exist -- is left for the next pass, once those
  -- children are gone. The schema has no cycle a per-table statement cannot
  -- clear, so a pass that removes nothing means something outside this
  -- function holds a reference, and that is an error rather than a silent
  -- partial delete.
  while array_length(v_remaining, 1) is not null loop
    v_pass := v_pass + 1;
    v_next := '{}';
    foreach v_table in array v_remaining loop
      begin
        execute format('delete from public.%I where tenant_id = $1', v_table)
          using p_tenant_id;
        get diagnostics v_count = row_count;
        v_counts := v_counts || jsonb_build_object(v_table, v_count);
      exception when foreign_key_violation or restrict_violation then
        v_last_error := sqlerrm;
        v_next := v_next || v_table;
      end;
    end loop;

    if array_length(v_next, 1) = array_length(v_remaining, 1) then
      raise exception 'TENANT_DELETE_BLOCKED: % (last error: %)',
        array_to_string(v_next, ', '), coalesce(v_last_error, 'none');
    end if;
    v_remaining := v_next;
  end loop;

  delete from public.audit_log al where al.tenant_id = p_tenant_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('audit_log', v_count);

  -- Memberships and selections cascade from the tenant row.
  delete from public.tenants t where t.id = p_tenant_id;

  return jsonb_build_object('tenant_id', p_tenant_id, 'passes', v_pass, 'deleted', v_counts);
end;
$$;

comment on function public.delete_tenant(uuid) is
  'Deletes every row a tenant owns, its audit trail, and the tenant itself. Refused unless the tenant is archived. service_role only.';

revoke execute on function public.delete_tenant(uuid) from public;
grant execute on function public.delete_tenant(uuid) to service_role;

-- 7. A composite `on delete set null` that nulls the wrong column -----------
--
-- Found the same way as the pass loop above: the demo is the first tenant to
-- hold a giveaway bucket *and* be deleted, and deleting the bucket failed with
-- "null value in column giveaway_id violates not-null".
--
-- Phase 4 made this foreign key composite so a prize cannot point at another
-- tenant's bucket (20260906080000). A composite `on delete set null` nulls
-- *every* referencing column unless it is told otherwise, and `giveaway_id` is
-- not-null -- so deleting a bucket raises rather than simply unbucketing its
-- prizes. That is reachable from the giveaway screens today, not only from
-- delete_tenant().
--
-- Postgres takes a column list for exactly this, and the two constraints
-- immediately beside this one on the same table already use it
-- (`on delete set null (source_inventory_item_id)`). This brings the bucket
-- key into line: losing a bucket unbuckets the prize and leaves it in its
-- giveaway, which is what the column means.
alter table public.giveaway_prizes drop constraint giveaway_prizes_bucket_fk;

alter table public.giveaway_prizes
  add constraint giveaway_prizes_bucket_fk
  foreign key (bucket_id, giveaway_id)
  references public.giveaway_buckets (id, giveaway_id)
  on delete set null (bucket_id);
