-- Local development seed data.
--
-- Runs after all migrations on `supabase db reset` / `supabase start`.
-- Local only: never applied to the linked project by `supabase db push`.
-- Everything below is fabricated (see docs/technical-spec.md §8 — seed data
-- must be safe for local dev and must not contain real donor or recipient
-- information).
--
-- Test accounts (password for all: "password123"). Sign in at
-- /portal/login with these instead of Google OAuth to exercise each role
-- locally:
--   admin@example.test         admin
--   coordinator@example.test   event_coordinator
--   finance@example.test       finance
--   board@example.test         board
--   volunteer@example.test     volunteer
--   multi@example.test         event_coordinator + volunteer (multi-role)
--   noaccess@example.test      signed in, no role assigned (access-denied path)
--   former@example.test        event_coordinator role, but deactivated (revoked-access path)

with new_users(email, full_name) as (
  values
    ('admin@example.test', 'Avery Morgan'),
    ('coordinator@example.test', 'Jordan Lee'),
    ('finance@example.test', 'Morgan Patel'),
    ('board@example.test', 'Taylor Brooks'),
    ('volunteer@example.test', 'Casey Rivera'),
    ('multi@example.test', 'Riley Chen'),
    ('noaccess@example.test', 'Sam Ellis'),
    ('former@example.test', 'Drew Kowalski')
),
inserted_users as (
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  )
  select
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
    email, extensions.crypt('password123', extensions.gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', full_name),
    now(), now(),
    '', '', '', ''
  from new_users
  returning id, email
)
insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select
  gen_random_uuid(), inserted_users.id::text, inserted_users.id,
  jsonb_build_object('sub', inserted_users.id::text, 'email', inserted_users.email, 'email_verified', true),
  'email', now(), now(), now()
from inserted_users;

-- Every portal account needs a linked people row: every owner/assignee column
-- in the portal references public.people, so an account without one can't be
-- assigned anything and won't appear in the calendar owner picker.
--
-- ensure_current_person() (20260902040000) does this at login and
-- 20260902050000 backfills existing accounts, but migrations run *before*
-- this file on `db reset` -- so the seeded accounts have to be linked here or
-- list_calendar_owners() comes back empty locally.
--
-- Two accounts get a preferred_name so the override is exercisable locally
-- and in e2e without having to set one first.
--
-- volunteer@example.test and noaccess@example.test are deliberately left
-- WITHOUT a people row: ensure_current_person() only runs at login, so an
-- account that has never signed in legitimately has none, and these two are
-- the local fixtures for that state (see
-- src/lib/auth/current-person.integration.test.ts, which exercises the
-- link-by-email and no-row paths against them).
insert into public.people (name, is_anonymous, source_type, email, auth_user_id, created_by, preferred_name)
select
  coalesce(u.raw_user_meta_data ->> 'full_name', u.email),
  false,
  'other',
  u.email,
  u.id,
  u.id,
  case u.email
    when 'admin@example.test' then 'Ave'
    when 'coordinator@example.test' then 'Jordy'
  end
from auth.users u
where u.email in (
  'admin@example.test', 'coordinator@example.test', 'finance@example.test',
  'board@example.test', 'multi@example.test', 'former@example.test'
)
and not exists (select 1 from public.people p where p.auth_user_id = u.id);

insert into public.user_roles (user_id, role_id, created_by)
select u.id, r.id, u.id
from auth.users u
join public.roles r on (
  (u.email = 'admin@example.test' and r.name = 'admin') or
  (u.email = 'coordinator@example.test' and r.name = 'event_coordinator') or
  (u.email = 'finance@example.test' and r.name = 'finance') or
  (u.email = 'board@example.test' and r.name = 'board') or
  (u.email = 'volunteer@example.test' and r.name = 'volunteer') or
  (u.email = 'multi@example.test' and r.name in ('event_coordinator', 'volunteer')) or
  (u.email = 'former@example.test' and r.name = 'event_coordinator')
)
where u.email in (
  'admin@example.test', 'coordinator@example.test', 'finance@example.test',
  'board@example.test', 'volunteer@example.test', 'multi@example.test', 'former@example.test'
);
-- noaccess@example.test intentionally gets no user_roles row.

-- Sample operational data, owned by the seeded admin account.
do $$
declare
  v_admin_id uuid;
  -- Calendar owner/reviewer reference public.people (20260902010000), not
  -- auth.users -- created_by still takes the auth id.
  v_admin_person_id uuid;
  v_person_donor1 uuid;
  v_person_donor2 uuid;
  v_person_sponsor uuid;
  v_person_volunteer uuid;
  v_person_local_roasters uuid;
  v_event_upcoming uuid;
  v_event_past uuid;
  v_event_draft uuid;
  v_donation1 uuid;
  v_donation2 uuid;
  v_item1 uuid;
  v_item2 uuid;
  v_item3 uuid;
  v_item4 uuid;
  v_giveaway_id uuid;
  v_prize1 uuid;
  v_prize2 uuid;
  v_program_id uuid;
  v_shift_id uuid;
  v_registration_id uuid;
  v_calendar_item_id uuid;
  v_recurring_local_date date;
  v_meeting_id uuid;
  v_role_type_id uuid;
  v_template_id uuid;
  v_template_version_id uuid;
  v_agenda_template_id uuid;
  v_agenda_template_version_id uuid;
  v_former_id uuid;
  v_person_applicant uuid;
  v_item5 uuid;
begin
  select id into v_admin_id from auth.users where email = 'admin@example.test';
  select id into v_admin_person_id from public.people where auth_user_id = v_admin_id;
  select id into v_former_id from auth.users where email = 'former@example.test';

  -- People: donors, a sponsor org, and a volunteer. Roles are derived from the
  -- records below (#624), so each of these gets a person_role_tags row instead
  -- of a column write -- the tag is what carries a role until its first
  -- donation, sponsorship, or signup exists.
  insert into public.people (name, is_anonymous, source_type, email, phone, notes, created_by)
  values ('Jamie Rivera', false, 'individual', 'jamie.rivera@example.test', '555-0101', null, v_admin_id)
  returning id into v_person_donor1;

  insert into public.people (name, is_anonymous, source_type, email, phone, notes, created_by)
  values ('Alex Chen', false, 'individual', 'alex.chen@example.test', '555-0102', null, v_admin_id)
  returning id into v_person_donor2;

  insert into public.people (name, is_anonymous, source_type, person_type, email, phone, notes, logo_url, website, created_by)
  values ('Summit Outdoor Co.', false, 'brand', 'organization', 'partnerships@summitoutdoor.example.test', '555-0103', 'Local gear retailer, annual sponsor.', 'https://example.test/logos/summit-outdoor.png', 'https://summitoutdoor.example.test', v_admin_id)
  returning id into v_person_sponsor;

  insert into public.people (name, is_anonymous, source_type, email, phone, notes, created_by)
  values ('Priya Natarajan', false, 'individual', 'priya.n@example.test', '555-0104', null, v_admin_id)
  returning id into v_person_volunteer;

  insert into public.people (name, is_anonymous, source_type, person_type, created_by)
  values ('Local Roasters Coffee', false, 'brand', 'organization', v_admin_id)
  returning id into v_person_local_roasters;

  insert into public.person_role_tags (person_id, role) values
    (v_person_donor1, 'donor'),
    (v_person_donor2, 'donor'),
    (v_person_sponsor, 'sponsor'),
    (v_person_volunteer, 'volunteer'),
    (v_person_local_roasters, 'donor');

  -- Events: one upcoming/published/public, one past/published/public with
  -- attendance recorded, one draft/private.
  insert into public.events (name, location, starts_at, ends_at, timezone, visibility, status, created_by)
  values (
    'Winter Gear Swap', 'Community Center, Denver CO',
    now() + interval '21 days', now() + interval '21 days' + interval '4 hours',
    'America/Denver', 'public', 'published', v_admin_id
  )
  returning id into v_event_upcoming;

  insert into public.events (
    name, location, starts_at, ends_at, timezone, visibility, status,
    attendance_count, attendance_notes, created_by
  )
  values (
    'Fall Trailhead Cleanup & Giveaway', 'Bear Creek Trailhead',
    now() - interval '40 days', now() - interval '40 days' + interval '5 hours',
    'America/Denver', 'public', 'published',
    68, 'Strong turnout despite cold weather.', v_admin_id
  )
  returning id into v_event_past;

  insert into public.events (name, location, starts_at, ends_at, timezone, visibility, status, created_by)
  values (
    'Spring Board Planning Session', 'Chatter Snow Office',
    now() + interval '10 days', now() + interval '10 days' + interval '2 hours',
    'America/Denver', 'private', 'draft', v_admin_id
  )
  returning id into v_event_draft;

  -- Event sponsor link (public, cash + in-kind support).
  insert into public.event_sponsors (
    event_id, person_id, support_type, in_kind_description, contribution_value, is_public, notes, created_by
  )
  values (
    v_event_upcoming, v_person_sponsor, 'both', 'Donated 20 pairs of snow boots', 1500.00, true,
    'Confirmed for the winter swap.', v_admin_id
  );

  -- Event expenses: one tied to the past event, one general/untied.
  insert into public.event_expenses (event_id, description, expense_date, amount, currency, notes, created_by, submitted_by)
  values (v_event_past, 'Trail signage and supplies', current_date - 40, 86.42, 'USD', null, v_admin_id, v_admin_id);

  insert into public.event_expenses (event_id, description, expense_date, amount, currency, notes, created_by, submitted_by)
  values (null, 'Storage unit rental — October', current_date - 10, 120.00, 'USD', 'Monthly inventory storage.', v_admin_id, v_admin_id);

  -- Event revenue: non-sponsorship income tied to the past event.
  insert into public.event_revenue (event_id, source, amount, received_date, notes, created_by)
  values (v_event_past, 'onsite_donations', 214.50, current_date - 40, 'Cash jar at the trailhead cleanup.', v_admin_id);

  -- Monetary donations: cash gifts recorded from the portal — one from a
  -- known donor, one anonymous, one tied to the past event. All within the
  -- current year so the finance report's year-to-date default sees them.
  insert into public.monetary_donations (donor_id, event_id, amount, method, received_date, notes, created_by)
  values (v_person_donor1, null, 100.00, 'check', current_date - 21, 'Annual gift.', v_admin_id);
  insert into public.monetary_donations (donor_id, event_id, amount, method, received_date, notes, created_by)
  values (null, null, 25.00, 'cash', current_date - 14, 'Dropped in the office donation box.', v_admin_id);
  insert into public.monetary_donations (donor_id, event_id, amount, method, received_date, notes, created_by)
  values (v_person_donor2, v_event_past, 50.00, 'card', current_date - 40, 'Pledged at the trailhead cleanup.', v_admin_id);

  -- Reimbursement: a volunteer's out-of-pocket spend, still awaiting approval.
  insert into public.reimbursements (person_id, event_id, description, amount, notes, submitted_by, created_by)
  values (v_person_volunteer, v_event_past, 'Gas for hauling donated gear to the trailhead.', 32.75, 'Receipt on file at the office.', v_admin_id, v_admin_id);

  -- Donations with items, plus receipt movements, tied to the upcoming event.
  insert into public.donations (donor_id, event_id, notes, created_by)
  values (v_person_donor1, v_event_upcoming, null, v_admin_id)
  returning id into v_donation1;

  insert into public.inventory_items (donation_id, description, size, type, gender, condition, face_value, status, created_by)
  values (v_donation1, 'Insulated winter jacket', 'M', 'jacket', 'unisex', 'good', 45.00, 'available', v_admin_id)
  returning id into v_item1;

  insert into public.inventory_items (donation_id, description, size, type, gender, condition, face_value, status, created_by)
  values (v_donation1, 'Snow boots', '9', 'boots', 'women', 'like_new', 30.00, 'available', v_admin_id)
  returning id into v_item2;

  insert into public.inventory_movements (inventory_item_id, movement_type, quantity, reason, event_id, created_by)
  values (v_item1, 'received', 1, 'Donation intake', v_event_upcoming, v_admin_id);
  insert into public.inventory_movements (inventory_item_id, movement_type, quantity, reason, event_id, created_by)
  values (v_item2, 'received', 1, 'Donation intake', v_event_upcoming, v_admin_id);

  insert into public.donations (donor_id, notes, created_by)
  values (v_person_donor2, 'Dropped off at office', v_admin_id)
  returning id into v_donation2;

  insert into public.inventory_items (donation_id, description, size, type, gender, condition, face_value, status, created_by)
  values (v_donation2, 'Fleece pullover', 'L', 'jacket', 'men', 'fair', 15.00, 'distributed', v_admin_id)
  returning id into v_item3;

  insert into public.inventory_items (donation_id, description, size, type, gender, condition, face_value, status, created_by)
  values (v_donation2, 'Snow pants', '10-12', 'pants', 'kids', 'good', 20.00, 'available', v_admin_id)
  returning id into v_item4;

  insert into public.inventory_movements (inventory_item_id, movement_type, quantity, reason, created_by)
  values (v_item3, 'received', 1, 'Donation intake', v_admin_id);
  insert into public.inventory_movements (inventory_item_id, movement_type, quantity, reason, event_id, created_by)
  values (v_item3, 'distributed', 1, 'Given out at trailhead cleanup', v_event_past, v_admin_id);
  insert into public.inventory_movements (inventory_item_id, movement_type, quantity, reason, created_by)
  values (v_item4, 'received', 1, 'Donation intake', v_admin_id);

  -- Fifth item, held on the public gear library: requested and reserved via
  -- the request_gear_item() flow (recipient is a person, not an event).
  insert into public.inventory_items (donation_id, description, size, type, gender, condition, face_value, status, created_by)
  values (v_donation2, 'Wool beanie', 'One size', 'accessory', 'unisex', 'good', 8.00, 'reserved', v_admin_id)
  returning id into v_item5;

  insert into public.inventory_movements (inventory_item_id, movement_type, quantity, reason, created_by)
  values (v_item5, 'received', 1, 'Donation intake', v_admin_id);
  insert into public.inventory_movements (inventory_item_id, movement_type, quantity, reason, recipient_person_id, created_by)
  values (v_item5, 'reserved', 1, 'Public gear library request', v_person_volunteer, v_admin_id);

  -- Giveaway for the past event: two prizes, one claimed winner.
  insert into public.giveaways (event_id, name, tickets_sold, ticket_price, revenue_amount, drawing_date, created_by)
  values (v_event_past, 'Trailhead Cleanup Giveaway', 142, 5.00, 710.00, now() - interval '40 days', v_admin_id)
  returning id into v_giveaway_id;

  insert into public.giveaway_prizes (giveaway_id, prize_name, donor_person_id, estimated_value, created_by)
  values (v_giveaway_id, 'Weekend cabin stay', v_person_sponsor, 400.00, v_admin_id)
  returning id into v_prize1;

  insert into public.giveaway_prizes (giveaway_id, prize_name, donor_person_id, estimated_value, created_by)
  values (v_giveaway_id, 'Gift basket', v_person_local_roasters, 60.00, v_admin_id)
  returning id into v_prize2;

  insert into public.giveaway_winners (giveaway_prize_id, winner_name, winner_contact, distribution_status, distributed_at, created_by)
  values (v_prize1, 'M. Alvarez', '555-0199', 'distributed', now() - interval '38 days', v_admin_id);

  insert into public.giveaway_winners (giveaway_prize_id, winner_name, distribution_status, created_by)
  values (v_prize2, 'T. Nguyen', 'pending', v_admin_id);

  -- Programs, event planning, volunteers, and attendance.
  insert into public.programs (name, description, status, created_by)
  values ('Winter Access Program', 'Gear access and low-cost outdoor events for local participants.', 'active', v_admin_id)
  returning id into v_program_id;

  update public.events
  set program_id = v_program_id, description = 'A community gear exchange and winter access event.',
      event_type = 'gear_swap', venue = 'Community Center', capacity = 100,
      registration_enabled = true, registration_deadline = now() + interval '14 days',
      budget_amount = 2500.00, event_lead_id = v_person_volunteer
  where id = v_event_upcoming;

  insert into public.event_logistics (event_id, meeting_point, gear_requirements, transportation, food, supplies, created_by)
  values (v_event_upcoming, 'Community Center front entrance', 'Bring clean winter gear to exchange.', 'RTD bus route 15', 'Coffee and snacks', 'Racks, hangers, intake forms', v_admin_id);

  insert into public.event_volunteers (event_id, person_id, role, notes, created_by)
  values (v_event_upcoming, v_person_volunteer, 'Intake lead', 'Welcomes donors and checks item condition.', v_admin_id);

  -- Staff, distinct from the volunteer above: the same person works this one
  -- in a scheduled capacity, which is exactly the both-at-once case #626
  -- exists to model.
  insert into public.event_staff (event_id, person_id, role, notes, created_by)
  values (v_event_upcoming, v_person_donor2, 'Basecamp lead', 'Runs the floor for the day.', v_admin_id);

  insert into public.event_staff (event_id, person_id, role, notes, created_by)
  values (v_event_past, v_person_volunteer, 'Guide', 'Paid guide for the day trip.', v_admin_id);

  insert into public.event_shifts (event_id, label, starts_at, ends_at, target_headcount, notes, created_by)
  values (v_event_upcoming, 'Morning setup', now() + interval '20 days' + interval '8 hours', now() + interval '20 days' + interval '10 hours', 3, 'Set up racks and intake tables.', v_admin_id)
  returning id into v_shift_id;

  update public.event_volunteers set shift_id = v_shift_id
  where event_id = v_event_upcoming and person_id = v_person_volunteer;

  -- Logged from the event editor's Volunteers tab. Since 20260904010000 that
  -- writes the shared volunteer_hours ledger too, with no role type -- the tab
  -- has no role picker. Kept distinct from the 3.00-hour entry below (same
  -- person and event, different work) so the rollup exercises multi-row summing.
  insert into public.volunteer_hours (event_id, person_id, hours, logged_date, notes, logged_by)
  values (v_event_past, v_person_volunteer, 4.50, current_date - 40, 'Cleanup and distribution support.', v_admin_id);

  insert into public.volunteer_role_types (name, description, is_public, created_by)
  values ('Ride Buddy', 'Supports participants during beginner outdoor activities.', true, v_admin_id)
  returning id into v_role_type_id;

  insert into public.volunteer_hours (person_id, event_id, volunteer_role_type_id, hours, logged_date, notes, logged_by)
  values (v_person_volunteer, v_event_past, v_role_type_id, 3.00, current_date - 40, 'Paired with first-time participants.', v_admin_id);

  -- Public volunteer applications, submitted via the /get-involved intake
  -- flow: one not yet followed up on, one an admin has picked up but not
  -- yet contacted.
  -- No role tag: the volunteer_applications row inserted right after is what
  -- derives the volunteer role (#624).
  insert into public.people (name, is_anonymous, source_type, email, phone, created_by)
  values ('Morgan Ellis', false, 'individual', 'morgan.ellis@example.test', '555-0105', v_admin_id)
  returning id into v_person_applicant;

  insert into public.volunteer_applications (person_id, name, email, phone, role_interest, availability, status, reference_code)
  values (v_person_applicant, 'Morgan Ellis', 'morgan.ellis@example.test', '555-0105', 'Ride Buddy', 'Weekend mornings', 'new', 'MRGNELLS');

  insert into public.people (name, is_anonymous, source_type, email, phone, created_by)
  values ('Taylor Kim', false, 'individual', 'taylor.kim@example.test', '555-0106', v_admin_id)
  returning id into v_person_applicant;

  insert into public.volunteer_applications (person_id, name, email, phone, role_interest, availability, status, reference_code)
  values (v_person_applicant, 'Taylor Kim', 'taylor.kim@example.test', '555-0106', 'Event Setup Crew', 'Weekday evenings', 'being reviewed', 'TYLRKIM2');

  -- Public contact-form submissions, exercising the ops inbox (issue #173):
  -- one unread so the notification bell/dashboard card have something to
  -- show out of the box, one already resolved to demonstrate the workflow.
  insert into public.contact_messages (name, email, topic, message, status)
  values ('Drew Sato', 'drew.sato@example.test', 'partnership', 'We run a gear shop downtown and would love to talk about a seasonal donation drive.', 'new');

  insert into public.contact_messages (name, email, topic, message, status)
  values ('Casey Nolan', 'casey.nolan@example.test', 'general', 'Do you have gear available in kids sizes right now?', 'resolved');

  insert into public.event_registrations (event_id, name, email, phone, party_size, notes, person_id, checked_in_at)
  values (v_event_upcoming, 'Jamie Rivera', 'jamie.rivera@example.test', '555-0101', 2, 'Needs one adult medium jacket.', v_person_donor1, null)
  returning id into v_registration_id;

  insert into public.discount_codes (event_id, code, description, source, registration_id, assigned_at, created_by)
  values (v_event_upcoming, 'SUMMIT-20', 'Twenty percent off partner gear', 'Summit Outdoor Co.', v_registration_id, now(), v_admin_id);

  insert into public.event_impact_notes (
    event_id, total_participants, first_time_participants, beginner_participants,
    volunteer_participants, equipment_loans_count, beginner_pairings_count,
    survey_respondents_count, survey_felt_welcomed_yes_count,
    survey_would_attend_again_yes_count, notes, created_by
  )
  values (v_event_past, 68, 24, 18, 11, 16, 9, 31, 30, 29, 'Participants especially valued loaner gear and peer support.', v_admin_id);

  -- Content and community calendar, including a pinned brief template version.
  insert into public.calendar_items (
    title, item_type, starts_at, ends_at, time_zone, summary, priority_tier,
    priority_rationale, calendar_status, visibility, owner_id, public_url, created_by
  )
  values (
    'Winter Gear Swap Promotion', 'content_opportunity', now() + interval '12 days', now() + interval '12 days' + interval '1 hour',
    'America/Denver', 'Promote the upcoming gear swap and registration link.', 1, 'Directly supports participant access and event turnout.',
    'active', 'public', v_admin_person_id, 'https://example.test/events/winter-gear-swap', v_admin_id
  )
  returning id into v_calendar_item_id;

  insert into public.calendar_item_categories (item_id, category)
  values (v_calendar_item_id, 'chatter_events'), (v_calendar_item_id, 'campaigns_fundraising');

  insert into public.calendar_item_programs (item_id, program_id)
  values (v_calendar_item_id, v_program_id);

  select id into v_template_id from public.content_brief_templates where key = 'community_spotlight';
  select current_version_id into v_template_version_id from public.content_brief_templates where id = v_template_id;

  insert into public.content_opportunities (
    calendar_item_id, content_status, chatter_connection, recommended_formats,
    recommended_action, outstanding_work, owner_id, reviewer_id, lead_time_days,
    publish_due_at, template_id, template_version_id, template_field_values, created_by
  )
  values (
    v_calendar_item_id, 'draft', 'Show how shared gear helps neighbors participate outdoors.',
    'Instagram post; email; event page', 'Publish a participant-centered event announcement.',
    'Confirm final registration link and accessibility details.', v_admin_person_id, v_admin_person_id, 14,
    now() + interval '7 days', v_template_id, v_template_version_id,
    '{"subject_name":"Chatter Snow community","setting":"Local winter trail","publish_permission":"Internal demo content only"}'::jsonb,
    v_admin_id
  );

  -- Structured-recurrence calendar item (issue #191): dated to today so the
  -- coverage reminder/"generate next year" flow has something to act on
  -- immediately after a fresh `db reset`, without waiting for a real
  -- October or hand-seeding via the production Tier 1/2 migration (which
  -- only applies when the founding admin's real email exists, which it
  -- doesn't in local dev -- see 20260826070000_seed_tier1_tier2_calendar_
  -- items.sql). Visit /portal/calendar/import to see it flagged as missing
  -- next year's instance and try "Generate".
  -- Anchored to the item's own zone (America/Denver), not UTC's day
  -- boundary -- truncating now() in UTC would read as "yesterday" in
  -- Denver for roughly a third of the day, both in starts_at/ends_at and
  -- in the recurrence_start_*/recurrence_end_* month-day anchors below.
  v_recurring_local_date := (now() at time zone 'America/Denver')::date;

  insert into public.calendar_items (
    title, item_type, starts_at, ends_at, time_zone, recurrence_rule,
    summary, priority_tier, calendar_status, visibility, source, region,
    series_key, recurrence_start_month, recurrence_start_day,
    recurrence_end_month, recurrence_end_day, recurrence_end_is_month_end,
    created_by
  )
  values (
    'Sample Recurring Observance', 'community_observance',
    (v_recurring_local_date::text || ' 00:00:00 America/Denver')::timestamptz,
    (v_recurring_local_date::text || ' 23:59:59 America/Denver')::timestamptz,
    'America/Denver', 'Annually on ' || to_char(v_recurring_local_date, 'FMMonth FMDD'),
    'Seed-only stand-in recurring observance for exercising the coverage reminder and bulk-import/generate flow locally.',
    1, 'idea', 'internal', 'Seed data', 'us',
    gen_random_uuid(), extract(month from v_recurring_local_date)::smallint, extract(day from v_recurring_local_date)::smallint,
    extract(month from v_recurring_local_date)::smallint, extract(day from v_recurring_local_date)::smallint, false,
    v_admin_id
  )
  returning id into v_calendar_item_id;

  insert into public.calendar_item_categories (item_id, category)
  values (v_calendar_item_id, 'lgbtq_community');

  -- Governance records and nonprofit tracking are separate from event data.
  insert into public.board_members (person_id, role_title, term_start, term_end, notes, created_by)
  values (v_person_sponsor, 'Community advisor', current_date - 120, current_date + 245, 'Seeded governance example.', v_admin_id);

  insert into public.governance_meetings (meeting_date, meeting_type, status, location, notes, facilitator_person_id, notetaker_person_id, created_by)
  values (now() - interval '14 days', 'board', 'completed', 'Video conference', 'Reviewed winter access program launch.', v_person_sponsor, v_person_volunteer, v_admin_id)
  returning id into v_meeting_id;

  insert into public.governance_meeting_attendees (meeting_id, person_id, attended, created_by)
  values (v_meeting_id, v_person_sponsor, true, v_admin_id);

  select id into v_agenda_template_id from public.agenda_templates where key = 'board_meeting';
  select current_version_id into v_agenda_template_version_id from public.agenda_templates where id = v_agenda_template_id;

  insert into public.agendas (
    meeting_id, body_text, template_id, template_version_id, ongoing_items,
    new_business, parking_lot, upcoming_dates, next_meeting_date, next_meeting_topics, created_by
  )
  values (
    v_meeting_id, '1. Program launch\n2. Nonprofit formation timeline', v_agenda_template_id, v_agenda_template_version_id,
    '{"finance_fundraising": "On track; see winter swap sponsorship.", "events": "Winter Gear Swap logistics confirmed."}'::jsonb,
    '["Discuss Q1 grant applications"]'::jsonb, '["Revisit storage unit lease renewal"]'::jsonb,
    '["Winter Gear Swap — 21 days out"]'::jsonb, current_date + 30, 'Post-event debrief; nonprofit formation update.',
    v_admin_id
  );
  insert into public.governance_meeting_action_items (meeting_id, description, owner_person_id, due_date, created_by)
  values (v_meeting_id, 'Confirm partner gear donation schedule.', v_person_sponsor, current_date + 14, v_admin_id);
  insert into public.governance_meeting_decisions (meeting_id, description, decision_date, topic, vote_result, created_by)
  values (v_meeting_id, 'Proceed with the winter gear swap pilot.', current_date - 14, 'Winter access program launch', 'Passed unanimously', v_admin_id);
  insert into public.resolutions (meeting_id, motion_text, mover_person_id, seconder_person_id, vote_outcome, effective_date, created_by)
  values (v_meeting_id, 'Adopt the winter access program as a core initiative.', v_person_sponsor, v_person_volunteer, 'passed', current_date - 14, v_admin_id);

  -- Administration edge cases: a staged invite and a deliberately deactivated user.
  insert into public.pending_role_grants (email, role_id, status, expires_at, name, created_by, invited_at, invited_by)
  select 'newvolunteer@example.test', r.id, 'pending', now() + interval '30 days', 'Quinn Harper', v_admin_id, now() - interval '1 day', v_admin_id
  from public.roles r where r.name = 'volunteer';

  insert into public.deactivated_users (user_id, deactivated_at, deactivated_by)
  values (v_former_id, now() - interval '5 days', v_admin_id);

end $$;

-- Bulk volume data, appended after the hand-authored scenario above. Purely
-- for exercising list/table UI (pagination, filters, sorting, empty vs.
-- crowded states) with a realistic quantity of rows in local dev -- not
-- meant to be individually meaningful the way the named records above are.
-- All fabricated, same as the rest of this file (see the file header).
do $$
declare
  v_admin_id uuid;
  -- Calendar owner/reviewer reference public.people (20260902010000), not
  -- auth.users -- created_by still takes the auth id.
  v_admin_person_id uuid;
  v_finance_id uuid;
  v_board_id uuid;

  first_names text[] := array['Jordan','Taylor','Morgan','Casey','Riley','Avery','Quinn','Reese','Harper','Skyler',
    'Dakota','Emerson','Rowan','Sawyer','Kendall','Peyton','Blair','Elliot','Marley','Finley',
    'Alexis','Cameron','Devon','Jamie','Micah','Noor','Toni','Val','Wren','Zion'];
  last_names text[] := array['Nguyen','Garcia','Smith','Johnson','Kim','Patel','Brown','Davis','Martinez','Lopez',
    'Wilson','Anderson','Thomas','Moore','Jackson','White','Harris','Clark','Lewis','Walker',
    'Young','Allen','King','Wright','Scott','Torres','Hill','Baker','Adams','Nelson'];
  brand_names text[] := array['Peak Outfitters','Alpine Gear Co.','Trailhead Supply','Frostline Apparel','Timberline Goods',
    'Ridgeline Outdoors','Summit Threads','Basecamp Provisions','Northface Neighbors Co-op','Powder Day Gear',
    'Evergreen Mercantile','Highline Sports'];
  event_type_names text[] := array['gear_swap','trail_cleanup','fundraiser','community_meetup','skills_clinic','holiday_drive'];
  item_types text[] := array['jacket','boots','pants','gloves','hat','scarf','socks','base_layer','goggles','backpack'];
  item_descs text[] := array['Insulated jacket','Waterproof boots','Snow pants','Fleece-lined gloves','Wool hat','Neck gaiter','Wool socks','Thermal base layer','Ski goggles','Daypack'];
  genders text[] := array['unisex','men','women','kids','other'];
  conditions text[] := array['new','like_new','good','fair','poor'];
  donation_notes text[] := array[null, 'Dropped off at the office', 'Collected at a gear drive box', 'Mailed in', null];
  contact_topics text[] := array['general','partnership','volunteering','donation','press','other'];

  v_person_id uuid;
  v_event_id uuid;
  v_donation_id uuid;
  v_item_id uuid;
  v_calendar_item_id uuid;
  v_meeting_id uuid;
  v_giveaway_id uuid;
  v_prize_id uuid;
  v_program_id uuid;
  v_service_id uuid;
  v_asset_id uuid;

  v_people_ids uuid[] := '{}';
  v_donor_ids uuid[] := '{}';
  v_volunteer_ids uuid[] := '{}';
  v_sponsor_ids uuid[] := '{}';
  v_event_ids uuid[] := '{}';
  v_program_ids uuid[] := '{}';
  v_agenda_template_id uuid;
  v_agenda_template_version_id uuid;

  i int;
  j int;
  k int;
  n_items int;
  v_first text;
  v_last text;
  v_starts_at timestamptz;
  v_status text;
  v_item_type text;
  v_visibility text;
  v_expense_status text;
  v_is_donor boolean;
  v_is_volunteer boolean;
  v_is_sponsor boolean;
begin
  select id into v_admin_id from auth.users where email = 'admin@example.test';
  select id into v_admin_person_id from public.people where auth_user_id = v_admin_id;
  select id into v_finance_id from auth.users where email = 'finance@example.test';
  select id into v_board_id from auth.users where email = 'board@example.test';

  -- ~65 individual people, mixed donor/volunteer roles. The two draws are
  -- taken once and reused for both the role tag and the pool this person is
  -- eligible for: they used to be drawn twice, so the flag on the row and the
  -- records behind it disagreed -- harmless while the flags were stored, and
  -- visibly wrong now that the roles are derived from those records (#624).
  for i in 1..65 loop
    v_first := first_names[1 + floor(random() * array_length(first_names, 1))::int];
    v_last := last_names[1 + floor(random() * array_length(last_names, 1))::int];
    v_is_donor := random() < 0.6;
    v_is_volunteer := random() < 0.35;
    insert into public.people (
      name, is_anonymous, source_type, email, phone, created_by
    )
    values (
      v_first || ' ' || v_last, false, 'individual',
      lower(v_first || '.' || v_last || i || '@example.test'),
      '555-' || lpad((1000 + i)::text, 4, '0'),
      v_admin_id
    )
    returning id into v_person_id;

    v_people_ids := array_append(v_people_ids, v_person_id);
    if v_is_donor then
      v_donor_ids := array_append(v_donor_ids, v_person_id);
      insert into public.person_role_tags (person_id, role) values (v_person_id, 'donor');
    end if;
    if v_is_volunteer then
      v_volunteer_ids := array_append(v_volunteer_ids, v_person_id);
      insert into public.person_role_tags (person_id, role) values (v_person_id, 'volunteer');
    end if;
  end loop;

  -- ~12 brand/org sponsors and donors. Every brand joins both pools, so some
  -- of them earn a role from an event_sponsors or donations row below even
  -- without the tag drawn here.
  for i in 1..array_length(brand_names, 1) loop
    v_is_sponsor := random() < 0.7;
    v_is_donor := random() < 0.5;
    insert into public.people (
      name, is_anonymous, source_type, person_type, email, phone,
      logo_url, website, notes, created_by
    )
    values (
      brand_names[i], false, 'brand', 'organization',
      lower(replace(brand_names[i], ' ', '')) || '@example.test',
      '555-' || lpad((2000 + i)::text, 4, '0'),
      'https://example.test/logos/' || i || '.png',
      'https://' || lower(replace(replace(brand_names[i], ' ', ''), '.', '')) || '.example.test',
      'Seed bulk-data sponsor/donor org.', v_admin_id
    )
    returning id into v_person_id;

    if v_is_sponsor then
      insert into public.person_role_tags (person_id, role) values (v_person_id, 'sponsor');
    end if;
    if v_is_donor then
      insert into public.person_role_tags (person_id, role) values (v_person_id, 'donor');
    end if;

    v_people_ids := array_append(v_people_ids, v_person_id);
    v_sponsor_ids := array_append(v_sponsor_ids, v_person_id);
    v_donor_ids := array_append(v_donor_ids, v_person_id);
  end loop;

  -- A few more programs, beyond the single one in the hand-authored section.
  for i in 1..3 loop
    insert into public.programs (name, description, status, created_by)
    values (
      (array['Summer Trail Access','Youth Outdoor Mentorship','Community Gear Library'])[i],
      'Seed bulk-data program for volume testing.',
      (array['active','pilot','retired'])[1 + floor(random() * 3)::int],
      v_admin_id
    )
    returning id into v_program_id;
    v_program_ids := array_append(v_program_ids, v_program_id);
  end loop;

  -- ~50 more volunteer role types would be excessive; a handful is plenty.
  for i in 1..4 loop
    insert into public.volunteer_role_types (name, description, is_public, created_by)
    values (
      (array['Setup Crew','Registration Desk','Gear Sorter','Trail Guide'])[i],
      'Seed bulk-data volunteer role.', true, v_admin_id
    );
  end loop;

  -- ~55 more events spanning far past to far future, every status/visibility.
  for i in 1..55 loop
    v_starts_at := now() + ((floor(random() * 500)::int - 250) || ' days')::interval + ((floor(random() * 12)::int) || ' hours')::interval;
    v_status := (array['draft','published','published','published','completed','completed','cancelled','archived'])[1 + floor(random() * 8)::int];
    v_visibility := case when v_status in ('draft', 'archived') and random() < 0.5 then 'private' else (array['public','private'])[1 + floor(random() * 2)::int] end;

    insert into public.events (
      name, location, starts_at, ends_at, timezone, visibility, status,
      description, event_type, venue, capacity, registration_enabled,
      registration_deadline, budget_amount, event_lead_id, program_id,
      created_by
    )
    values (
      initcap((array['Spring','Summer','Fall','Winter','Neighborhood','Downtown','Riverside','Mountain'])[1 + floor(random()*8)::int]) || ' ' ||
        initcap((event_type_names[1 + floor(random() * array_length(event_type_names,1))::int])) || ' #' || i,
      (array['Community Center, Denver CO','Bear Creek Trailhead','Chatter Snow Office','Riverside Park','Downtown Rec Center'])[1 + floor(random()*5)::int],
      v_starts_at, v_starts_at + ((2 + floor(random()*5)::int) || ' hours')::interval,
      'America/Denver', v_visibility, v_status,
      'Seed bulk-data event for volume testing.',
      event_type_names[1 + floor(random() * array_length(event_type_names,1))::int],
      'Main hall', 20 + floor(random()*180)::int,
      random() < 0.5, v_starts_at - interval '7 days',
      round((200 + random() * 4800)::numeric, 2),
      v_people_ids[1 + floor(random()*array_length(v_people_ids,1))::int],
      case when random() < 0.4 and array_length(v_program_ids,1) is not null then v_program_ids[1 + floor(random()*array_length(v_program_ids,1))::int] else null end,
      v_admin_id
    )
    returning id into v_event_id;

    v_event_ids := array_append(v_event_ids, v_event_id);

    -- Logistics for about a third.
    if random() < 0.35 then
      insert into public.event_logistics (event_id, meeting_point, gear_requirements, transportation, food, supplies, created_by)
      values (v_event_id, 'Front entrance', 'Weather-appropriate layers.', 'Street parking available', 'Water and snacks provided', 'Signage, tables, first aid kit', v_admin_id);
    end if;

    -- Sponsor link for about a quarter.
    if random() < 0.25 and array_length(v_sponsor_ids, 1) is not null then
      insert into public.event_sponsors (event_id, person_id, support_type, in_kind_description, contribution_value, is_public, follow_up_status, notes, created_by)
      values (
        v_event_id, v_sponsor_ids[1 + floor(random()*array_length(v_sponsor_ids,1))::int],
        (array['cash','in_kind','both','other'])[1 + floor(random()*4)::int],
        'Seed in-kind support.', round((100 + random()*2000)::numeric, 2), random() < 0.7,
        (array['not_started','in_progress','done'])[1 + floor(random()*3)::int],
        null, v_admin_id
      );
    end if;

    -- Expense for about 40%. Uses its own status variable -- v_status holds
    -- the event's own status and is still read below (registrations).
    if random() < 0.4 then
      v_expense_status := (array['submitted','approved','approved','rejected','paid','paid'])[1 + floor(random()*6)::int];
      insert into public.event_expenses (
        event_id, description, expense_date, amount, currency, notes,
        created_by, submitted_by, status, approved_by, approved_at,
        rejected_at, rejection_reason, paid_by, paid_at
      )
      values (
        v_event_id, (array['Signage and supplies','Venue rental','Food and drinks','Printing','Equipment rental','Transportation'])[1 + floor(random()*6)::int],
        v_starts_at::date, round((15 + random()*450)::numeric, 2), 'USD', null,
        v_admin_id, v_finance_id, v_expense_status,
        case when v_expense_status in ('approved','paid') then v_board_id end,
        case when v_expense_status in ('approved','paid') then v_starts_at + interval '2 days' end,
        case when v_expense_status = 'rejected' then v_starts_at + interval '2 days' end,
        case when v_expense_status = 'rejected' then 'Missing receipt.' end,
        case when v_expense_status = 'paid' then v_finance_id end,
        case when v_expense_status = 'paid' then v_starts_at + interval '5 days' end
      );
    end if;

    -- Revenue for about 30%.
    if random() < 0.3 then
      insert into public.event_revenue (event_id, source, amount, received_date, notes, created_by)
      values (
        v_event_id, (array['ticket_sales','registration_fees','merchandise','onsite_donations','grants','other'])[1 + floor(random()*6)::int],
        round((25 + random()*900)::numeric, 2), v_starts_at::date, null, v_admin_id
      );
    end if;

    -- Checklist items for about 40%.
    if random() < 0.4 then
      n_items := 2 + floor(random()*4)::int;
      for j in 1..n_items loop
        insert into public.event_checklist_items (event_id, title, is_done, completed_at, created_by)
        values (
          v_event_id,
          (array['Confirm venue','Order supplies','Send volunteer reminders','Post to social media','Print sign-in sheets','Coordinate with sponsor','Set up registration table','Debrief with team'])[1 + floor(random()*8)::int],
          random() < 0.5,
          case when random() < 0.5 then v_starts_at - interval '1 day' end,
          v_admin_id
        );
      end loop;
    end if;

    -- Registrations for registration-enabled published events.
    if v_status = 'published' and random() < 0.5 then
      n_items := 3 + floor(random()*25)::int;
      for j in 1..n_items loop
        v_first := first_names[1 + floor(random() * array_length(first_names, 1))::int];
        v_last := last_names[1 + floor(random() * array_length(last_names, 1))::int];
        insert into public.event_registrations (event_id, name, email, phone, party_size, notes, checked_in_at)
        values (
          v_event_id, v_first || ' ' || v_last,
          lower(v_first || '.' || v_last || '.' || j || '.' || left(v_event_id::text, 8) || '@example.test'),
          '555-' || lpad((3000 + j)::text, 4, '0'),
          1 + floor(random()*4)::int, null,
          case when v_starts_at < now() and random() < 0.7 then v_starts_at end
        );
      end loop;
    end if;

    -- Shifts + volunteer signups for about a quarter.
    if random() < 0.25 and array_length(v_volunteer_ids, 1) is not null then
      declare
        v_shift_id uuid;
      begin
        insert into public.event_shifts (event_id, label, starts_at, ends_at, target_headcount, notes, created_by)
        values (v_event_id, (array['Morning setup','Midday support','Afternoon teardown'])[1 + floor(random()*3)::int],
          v_starts_at, v_starts_at + interval '2 hours', 2 + floor(random()*4)::int, null, v_admin_id)
        returning id into v_shift_id;

        for j in 1..(1 + floor(random()*3)::int) loop
          insert into public.event_volunteers (event_id, person_id, role, shift_id, notes, created_by)
          values (
            v_event_id, v_volunteer_ids[1 + floor(random()*array_length(v_volunteer_ids,1))::int],
            (array['Intake lead','Greeter','Setup crew','Registration desk'])[1 + floor(random()*4)::int],
            v_shift_id, null, v_admin_id
          )
          on conflict (event_id, person_id) do nothing;
        end loop;
      end;
    end if;

    -- Volunteer hours logged for past events, about half.
    if v_starts_at < now() and random() < 0.5 and array_length(v_volunteer_ids, 1) is not null then
      insert into public.volunteer_hours (event_id, person_id, hours, logged_date, notes, logged_by)
      values (
        v_event_id, v_volunteer_ids[1 + floor(random()*array_length(v_volunteer_ids,1))::int],
        round((1 + random()*7)::numeric, 2), v_starts_at::date, null, v_admin_id
      );
    end if;

    -- Impact notes for completed/past published events, about a third.
    if v_starts_at < now() and random() < 0.3 then
      insert into public.event_impact_notes (
        event_id, total_participants, first_time_participants, beginner_participants,
        volunteer_participants, equipment_loans_count, beginner_pairings_count,
        survey_respondents_count, survey_felt_welcomed_yes_count,
        survey_would_attend_again_yes_count, notes, created_by
      )
      values (
        v_event_id, 10 + floor(random()*90)::int, floor(random()*30)::int, floor(random()*20)::int,
        floor(random()*15)::int, floor(random()*25)::int, floor(random()*10)::int,
        floor(random()*40)::int, floor(random()*35)::int, floor(random()*35)::int,
        'Seed bulk-data impact notes.', v_admin_id
      );
    end if;

    -- Giveaway for about 1 in 6 past events.
    if v_starts_at < now() and random() < 0.16 then
      insert into public.giveaways (event_id, name, tickets_sold, ticket_price, revenue_amount, drawing_date, created_by)
      values (v_event_id, 'Event Giveaway', 40 + floor(random()*200)::int, 5.00, round((200 + random()*800)::numeric, 2), v_starts_at, v_admin_id)
      returning id into v_giveaway_id;

      for j in 1..(1 + floor(random()*3)::int) loop
        insert into public.giveaway_prizes (giveaway_id, prize_name, donor_person_id, estimated_value, created_by)
        values (
          v_giveaway_id, (array['Gift card','Gear bundle','Weekend rental','Local restaurant voucher'])[1 + floor(random()*4)::int],
          case when array_length(v_sponsor_ids,1) is not null and random() < 0.6 then v_sponsor_ids[1 + floor(random()*array_length(v_sponsor_ids,1))::int] end,
          round((20 + random()*300)::numeric, 2), v_admin_id
        )
        returning id into v_prize_id;

        if random() < 0.7 then
          v_first := first_names[1 + floor(random() * array_length(first_names, 1))::int];
          insert into public.giveaway_winners (giveaway_prize_id, winner_name, distribution_status, distributed_at, created_by)
          values (
            v_prize_id, v_first || ' ' || upper(left(last_names[1 + floor(random()*array_length(last_names,1))::int], 1)) || '.',
            (array['pending','distributed','unclaimed'])[1 + floor(random()*3)::int],
            case when random() < 0.6 then v_starts_at + interval '2 days' end, v_admin_id
          );
        end if;
      end loop;
    end if;

    -- Discount codes for events with auto-assign turned on, about 1 in 5.
    if random() < 0.2 then
      update public.events set auto_assign_discount_codes = true where id = v_event_id;
      for j in 1..(5 + floor(random()*10)::int) loop
        insert into public.discount_codes (event_id, code, description, source, created_by)
        values (v_event_id, 'SEED-' || upper(left(v_event_id::text, 4)) || '-' || j, 'Partner discount', 'Seed partner', v_admin_id);
      end loop;
    end if;
  end loop;

  -- ~130 more donations, 1-3 inventory items each.
  for i in 1..130 loop
    insert into public.donations (donor_id, event_id, notes, created_by)
    values (
      v_donor_ids[1 + floor(random()*array_length(v_donor_ids,1))::int],
      case when random() < 0.3 and array_length(v_event_ids,1) is not null then v_event_ids[1 + floor(random()*array_length(v_event_ids,1))::int] else null end,
      donation_notes[1 + floor(random()*array_length(donation_notes,1))::int],
      v_admin_id
    )
    returning id into v_donation_id;

    n_items := 1 + floor(random()*3)::int;
    for j in 1..n_items loop
      k := 1 + floor(random() * array_length(item_types, 1))::int;
      v_status := (array['available','available','available','distributed','reserved','damaged','lost','retired'])[1 + floor(random()*8)::int];
      insert into public.inventory_items (donation_id, description, size, type, gender, condition, face_value, status, notes, created_by)
      values (
        v_donation_id, item_descs[k], (array['XS','S','M','L','XL','One size'])[1 + floor(random()*6)::int],
        item_types[k], genders[1 + floor(random()*array_length(genders,1))::int],
        conditions[1 + floor(random()*array_length(conditions,1))::int],
        round((5 + random()*80)::numeric, 2), v_status, null, v_admin_id
      )
      returning id into v_item_id;

      insert into public.inventory_movements (inventory_item_id, movement_type, quantity, reason, created_by)
      values (v_item_id, 'received', 1, 'Donation intake', v_admin_id);

      if v_status = 'distributed' then
        insert into public.inventory_movements (inventory_item_id, movement_type, quantity, reason, recipient_person_id, created_by)
        values (v_item_id, 'distributed', 1, 'Given out', v_people_ids[1 + floor(random()*array_length(v_people_ids,1))::int], v_admin_id);
      elsif v_status = 'reserved' then
        insert into public.inventory_movements (inventory_item_id, movement_type, quantity, reason, recipient_person_id, created_by)
        values (v_item_id, 'reserved', 1, 'Public gear library request', v_people_ids[1 + floor(random()*array_length(v_people_ids,1))::int], v_admin_id);
      elsif v_status in ('damaged', 'lost', 'retired') then
        insert into public.inventory_movements (inventory_item_id, movement_type, quantity, reason, created_by)
        values (v_item_id, v_status, 1, 'Marked ' || v_status, v_admin_id);
      end if;
    end loop;
  end loop;

  -- ~90 more monetary donations, spread across the last 15 months so both
  -- the finance report's default (year-to-date) and prior-year views have data.
  for i in 1..90 loop
    insert into public.monetary_donations (donor_id, event_id, amount, method, received_date, notes, created_by)
    values (
      case when random() < 0.85 then v_donor_ids[1 + floor(random()*array_length(v_donor_ids,1))::int] else null end,
      case when random() < 0.25 and array_length(v_event_ids,1) is not null then v_event_ids[1 + floor(random()*array_length(v_event_ids,1))::int] else null end,
      round((10 + random()*490)::numeric, 2),
      (array['cash','check','card','bank_transfer','online','other'])[1 + floor(random()*6)::int],
      (current_date - floor(random()*450)::int),
      null, v_admin_id
    );
  end loop;

  -- ~35 more reimbursements across the workflow's statuses.
  for i in 1..35 loop
    v_status := (array['submitted','submitted','approved','rejected','paid','paid'])[1 + floor(random()*6)::int];
    insert into public.reimbursements (
      person_id, event_id, description, amount, notes, submitted_by, created_by,
      status, approved_by, approved_at, rejected_at, rejection_reason, paid_by, paid_at
    )
    values (
      v_people_ids[1 + floor(random()*array_length(v_people_ids,1))::int],
      case when random() < 0.6 and array_length(v_event_ids,1) is not null then v_event_ids[1 + floor(random()*array_length(v_event_ids,1))::int] else null end,
      (array['Gas for gear pickup','Supplies for the intake table','Printing costs','Parking reimbursement'])[1 + floor(random()*4)::int],
      round((8 + random()*180)::numeric, 2), null, v_finance_id, v_admin_id,
      v_status,
      case when v_status in ('approved','paid') then v_board_id end,
      case when v_status in ('approved','paid') then now() - (floor(random()*60)::int || ' days')::interval end,
      case when v_status = 'rejected' then now() - (floor(random()*60)::int || ' days')::interval end,
      case when v_status = 'rejected' then 'Receipt missing.' end,
      case when v_status = 'paid' then v_finance_id end,
      case when v_status = 'paid' then now() - (floor(random()*30)::int || ' days')::interval end
    );
  end loop;

  -- ~45 volunteer applications across every status.
  for i in 1..45 loop
    v_first := first_names[1 + floor(random() * array_length(first_names, 1))::int];
    v_last := last_names[1 + floor(random() * array_length(last_names, 1))::int];
    -- No role tag: the volunteer_applications row below derives it (#624).
    insert into public.people (name, is_anonymous, source_type, email, phone, created_by)
    values (v_first || ' ' || v_last, false, 'individual', lower(v_first || '.' || v_last || '.app' || i || '@example.test'), '555-' || lpad((4000+i)::text,4,'0'), v_admin_id)
    returning id into v_person_id;

    insert into public.volunteer_applications (person_id, name, email, phone, role_interest, availability, status, reference_code)
    values (
      v_person_id, v_first || ' ' || v_last, lower(v_first || '.' || v_last || '.app' || i || '@example.test'),
      '555-' || lpad((4000+i)::text,4,'0'),
      (array['Ride Buddy','Event Setup Crew','Registration Desk','Trail Guide','Gear Sorter'])[1 + floor(random()*5)::int],
      (array['Weekday evenings','Weekend mornings','Weekend afternoons','Flexible'])[1 + floor(random()*4)::int],
      (array['new','being reviewed','contacted','placed','declined','closed'])[1 + floor(random()*6)::int],
      'SEED' || lpad(i::text, 4, '0')
    );
  end loop;

  -- ~45 contact messages across every status.
  for i in 1..45 loop
    v_first := first_names[1 + floor(random() * array_length(first_names, 1))::int];
    v_last := last_names[1 + floor(random() * array_length(last_names, 1))::int];
    insert into public.contact_messages (name, email, topic, message, status)
    values (
      v_first || ' ' || v_last, lower(v_first || '.' || v_last || '.msg' || i || '@example.test'),
      contact_topics[1 + floor(random()*array_length(contact_topics,1))::int],
      'Seed bulk-data message body for volume testing the ops inbox.',
      (array['new','read','resolved'])[1 + floor(random()*3)::int]
    );
  end loop;

  -- ~65 more calendar items across every item type, with categories, and a
  -- content_opportunities brief for the content/partner-opportunity ones so
  -- the content pipeline board also gets volume.
  for i in 1..65 loop
    v_starts_at := now() + ((floor(random() * 300)::int - 100) || ' days')::interval;
    v_item_type := (array['chatter_event','partner_event','community_observance','heritage_social_justice_moment','winter_outdoor_sports_moment','content_campaign','fundraiser','partner_opportunity','content_opportunity'])[1 + floor(random()*9)::int];
    insert into public.calendar_items (
      title, item_type, starts_at, ends_at, time_zone, summary, priority_tier,
      calendar_status, visibility, owner_id, created_by
    )
    values (
      'Seed calendar item #' || i, v_item_type,
      v_starts_at, v_starts_at + interval '2 hours', 'America/Denver',
      'Seed bulk-data calendar item for volume testing.',
      1 + floor(random()*3)::int,
      (array['idea','active','complete','archived'])[1 + floor(random()*4)::int],
      (array['public','internal','unlisted_draft'])[1 + floor(random()*3)::int],
      v_admin_person_id, v_admin_id
    )
    returning id into v_calendar_item_id;

    insert into public.calendar_item_categories (item_id, category)
    values (
      v_calendar_item_id,
      (array['lgbtq_community','winter_outdoor_sports','community_social_justice','chatter_events','campaigns_fundraising','partner_opportunities'])[1 + floor(random()*6)::int]
    );
    if random() < 0.3 then
      insert into public.calendar_item_categories (item_id, category)
      values (
        v_calendar_item_id,
        (array['lgbtq_community','winter_outdoor_sports','community_social_justice','chatter_events','campaigns_fundraising','partner_opportunities'])[1 + floor(random()*6)::int]
      )
      on conflict do nothing;
    end if;

    if v_item_type in ('content_opportunity', 'partner_opportunity') then
      insert into public.content_opportunities (
        calendar_item_id, content_status, chatter_connection, recommended_formats,
        recommended_action, owner_id, reviewer_id, lead_time_days, publish_due_at, created_by
      )
      values (
        v_calendar_item_id,
        (array['not_planned','idea','draft','in_review','changes_requested','approved','scheduled','published'])[1 + floor(random()*8)::int],
        'Seed bulk-data content connection note.', 'Instagram post; email',
        'Seed recommended action.', v_admin_person_id, v_admin_person_id,
        7 + floor(random()*21)::int, v_starts_at - interval '7 days', v_admin_id
      );
    end if;
  end loop;

  -- ~20 more governance meetings, each with attendees / agenda / minutes /
  -- action items / decisions, some resolutions.
  select id into v_agenda_template_id from public.agenda_templates where key = 'board_meeting';
  select current_version_id into v_agenda_template_version_id from public.agenda_templates where id = v_agenda_template_id;

  for i in 1..20 loop
    v_starts_at := now() - ((floor(random() * 700)::int) || ' days')::interval;
    insert into public.governance_meetings (meeting_date, meeting_type, status, location, notes, facilitator_person_id, notetaker_person_id, created_by)
    values (
      v_starts_at, (array['board','committee','annual','other'])[1 + floor(random()*4)::int],
      'completed', (array['Video conference','Chatter Snow Office','Community Center'])[1 + floor(random()*3)::int],
      'Seed bulk-data governance meeting.',
      v_people_ids[1 + floor(random()*array_length(v_people_ids,1))::int],
      v_people_ids[1 + floor(random()*array_length(v_people_ids,1))::int],
      v_admin_id
    )
    returning id into v_meeting_id;

    for j in 1..(2 + floor(random()*3)::int) loop
      insert into public.governance_meeting_attendees (meeting_id, person_id, attended, created_by)
      values (v_meeting_id, v_people_ids[1 + floor(random()*array_length(v_people_ids,1))::int], random() < 0.85, v_admin_id)
      on conflict (meeting_id, person_id) do nothing;
    end loop;

    insert into public.agendas (meeting_id, body_text, template_id, template_version_id, created_by)
    values (v_meeting_id, '1. Updates\n2. Old business\n3. New business', v_agenda_template_id, v_agenda_template_version_id, v_admin_id);

    for j in 1..(1 + floor(random()*3)::int) loop
      insert into public.governance_meeting_action_items (meeting_id, description, owner_person_id, due_date, status, created_by)
      values (
        v_meeting_id, 'Seed action item #' || j, v_people_ids[1 + floor(random()*array_length(v_people_ids,1))::int],
        (v_starts_at + interval '30 days')::date, (array['open','done'])[1 + floor(random()*2)::int], v_admin_id
      );
    end loop;

    if random() < 0.5 then
      insert into public.governance_meeting_decisions (meeting_id, description, decision_date, topic, vote_result, created_by)
      values (v_meeting_id, 'Seed bulk-data decision.', v_starts_at::date, 'General business', 'Passed unanimously', v_admin_id);
    end if;

    if random() < 0.3 then
      insert into public.resolutions (meeting_id, motion_text, mover_person_id, seconder_person_id, vote_outcome, effective_date, created_by)
      values (
        v_meeting_id, 'Seed bulk-data resolution motion.',
        v_people_ids[1 + floor(random()*array_length(v_people_ids,1))::int],
        v_people_ids[1 + floor(random()*array_length(v_people_ids,1))::int],
        'passed', v_starts_at::date, v_admin_id
      );
    end if;
  end loop;

  -- ~8 more board members (respecting one-active-term-per-person via the
  -- partial unique index rather than a separate random-vs-random exists
  -- check, which would compare two independently-random picks).
  for i in 1..8 loop
    insert into public.board_members (person_id, role_title, term_start, term_end, is_active, notes, created_by)
    select
      v_people_ids[1 + floor(random()*array_length(v_people_ids,1))::int],
      (array['Board member','Treasurer','Secretary','Vice chair'])[1 + floor(random()*4)::int],
      current_date - (365 + floor(random()*365)::int),
      case when random() < 0.3 then current_date - floor(random()*30)::int end,
      (random() < 0.7),
      'Seed bulk-data board term.', v_admin_id
    on conflict (person_id) where is_active do nothing;
  end loop;

  -- ~10 annual compliance requirements.
  for i in 1..10 loop
    insert into public.annual_requirements (name, due_date, status, responsible_person_id, created_by)
    values (
      (array['Form 990 filing','State charitable registration renewal','D&O insurance renewal','Annual board self-assessment','Bylaws review'])[1 + floor(random()*5)::int] || ' ' || (2025 + i),
      current_date + (floor(random()*400)::int - 100),
      (array['not_started','in_progress','done'])[1 + floor(random()*3)::int],
      v_people_ids[1 + floor(random()*array_length(v_people_ids,1))::int],
      v_admin_id
    );
  end loop;

  -- Access management: modest scale per the module's own "under 25 assets" design.
  for i in 1..8 loop
    insert into public.services (name, website, created_by)
    values ((array['Cloudflare','GitHub','Vercel','Supabase','Zoho','Mailchimp','Instagram','QuickBooks'])[i], 'https://example.test', v_admin_id)
    returning id into v_service_id;

    insert into public.assets (name, service_id, category, description, is_org_owned, owner_person_id, status, sensitivity, mfa_required, mfa_status, created_by)
    values (
      (array['Cloudflare','GitHub','Vercel','Supabase','Zoho','Mailchimp','Instagram','QuickBooks'])[i] || ' account',
      v_service_id, (array['domain','hosting','database','social','financial','communication','productivity','other'])[i],
      'Seed bulk-data asset.', true, v_people_ids[1 + floor(random()*array_length(v_people_ids,1))::int], 'active',
      (array['low','medium','high','critical'])[1 + floor(random()*4)::int],
      random() < 0.6, (array['enabled','disabled','unknown'])[1 + floor(random()*3)::int], v_admin_id
    )
    returning id into v_asset_id;

    for j in 1..(1 + floor(random()*3)::int) loop
      insert into public.access_grants (asset_id, person_id, access_level, account_identifier, granted_at, status, created_by)
      select v_asset_id, v_people_ids[1 + floor(random()*array_length(v_people_ids,1))::int],
        (array['owner','admin','manager','editor','viewer'])[1 + floor(random()*5)::int],
        'user' || j || '@example.test', current_date - floor(random()*400)::int,
        'active', v_admin_id
      on conflict (asset_id, person_id) where status = 'active' do nothing;
    end loop;
  end loop;
end $$;

-- Page visibility (issue #584). Production deliberately has no
-- `page_visibility.*` rows, so the sections still awaiting board approval fall
-- back to `defaultVisible: false` in src/lib/page-visibility.ts and stay dark.
-- Local development and CI need them visible, otherwise the existing public
-- e2e specs and the e2e/a11y-scan.ts route list would all 404.
insert into public.app_settings (key, value) values
  ('page_visibility.programs', to_jsonb(true)),
  ('page_visibility.learn', to_jsonb(true)),
  ('page_visibility.support', to_jsonb(true))
on conflict (key) do update set value = excluded.value;

-- The first-login welcome tour (20260902060000) opens a modal over the portal
-- shell for any account whose welcome_completed_at is null. Every e2e spec
-- signs in as one of these accounts and drives portal pages, so leaving them
-- un-toured would put a dialog in front of all of them. Mark them done here;
-- the tour itself is covered by welcome-dialog.dom.test.tsx and
-- welcome/actions.integration.test.ts, and can be replayed locally from
-- /portal/account.
-- last_release_seen gets a key no CURRENT_RELEASE will ever exceed, for the
-- same reason: the "what's new" dialog (20260902070000) would otherwise sit
-- over the e2e suite every time someone bumps the release, and seed.sql has no
-- way to read that constant out of the TypeScript that owns it. To see the
-- release notes locally, clear it for your account:
--   update public.user_onboarding set last_release_seen = null;
insert into public.user_onboarding (user_id, first_seen_at, welcome_completed_at, last_release_seen)
select u.id, u.created_at, now(), '9999-12-31'
from auth.users u
on conflict (user_id) do update
  set welcome_completed_at = now(),
      last_release_seen = '9999-12-31';
