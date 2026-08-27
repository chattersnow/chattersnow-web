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
  select id into v_former_id from auth.users where email = 'former@example.test';

  -- People: donors, a sponsor org, and a volunteer.
  insert into public.people (name, is_anonymous, source_type, email, phone, notes, is_donor, created_by)
  values ('Jamie Rivera', false, 'individual', 'jamie.rivera@example.test', '555-0101', null, true, v_admin_id)
  returning id into v_person_donor1;

  insert into public.people (name, is_anonymous, source_type, email, phone, notes, is_donor, created_by)
  values ('Alex Chen', false, 'individual', 'alex.chen@example.test', '555-0102', null, true, v_admin_id)
  returning id into v_person_donor2;

  insert into public.people (name, is_anonymous, source_type, email, phone, notes, is_sponsor, logo_url, website, created_by)
  values ('Summit Outdoor Co.', false, 'brand', 'partnerships@summitoutdoor.example.test', '555-0103', 'Local gear retailer, annual sponsor.', true, 'https://example.test/logos/summit-outdoor.png', 'https://summitoutdoor.example.test', v_admin_id)
  returning id into v_person_sponsor;

  insert into public.people (name, is_anonymous, source_type, email, phone, notes, is_volunteer, created_by)
  values ('Priya Natarajan', false, 'individual', 'priya.n@example.test', '555-0104', null, true, v_admin_id)
  returning id into v_person_volunteer;

  insert into public.people (name, is_anonymous, source_type, is_donor, created_by)
  values ('Local Roasters Coffee', false, 'brand', true, v_admin_id)
  returning id into v_person_local_roasters;

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
      budget_amount = 2500.00, event_lead_id = v_admin_id
  where id = v_event_upcoming;

  insert into public.event_logistics (event_id, meeting_point, gear_requirements, transportation, food, supplies, created_by)
  values (v_event_upcoming, 'Community Center front entrance', 'Bring clean winter gear to exchange.', 'RTD bus route 15', 'Coffee and snacks', 'Racks, hangers, intake forms', v_admin_id);

  insert into public.event_volunteers (event_id, person_id, role, notes, created_by)
  values (v_event_upcoming, v_person_volunteer, 'Intake lead', 'Welcomes donors and checks item condition.', v_admin_id);

  insert into public.event_shifts (event_id, label, starts_at, ends_at, target_headcount, notes, created_by)
  values (v_event_upcoming, 'Morning setup', now() + interval '20 days' + interval '8 hours', now() + interval '20 days' + interval '10 hours', 3, 'Set up racks and intake tables.', v_admin_id)
  returning id into v_shift_id;

  update public.event_volunteers set shift_id = v_shift_id
  where event_id = v_event_upcoming and person_id = v_person_volunteer;

  insert into public.event_volunteer_hours (event_id, person_id, hours, logged_date, notes, logged_by)
  values (v_event_past, v_person_volunteer, 4.50, current_date - 40, 'Cleanup and distribution support.', v_admin_id);

  insert into public.volunteer_role_types (name, description, is_public, created_by)
  values ('Ride Buddy', 'Supports participants during beginner outdoor activities.', true, v_admin_id)
  returning id into v_role_type_id;

  insert into public.volunteer_hours (person_id, event_id, volunteer_role_type_id, hours, logged_date, notes, logged_by)
  values (v_person_volunteer, v_event_past, v_role_type_id, 3.00, current_date - 40, 'Paired with first-time participants.', v_admin_id);

  -- Public volunteer applications, submitted via the /get-involved intake
  -- flow: one not yet followed up on, one an admin has picked up but not
  -- yet contacted.
  insert into public.people (name, is_anonymous, source_type, email, phone, is_volunteer, created_by)
  values ('Morgan Ellis', false, 'individual', 'morgan.ellis@example.test', '555-0105', true, v_admin_id)
  returning id into v_person_applicant;

  insert into public.volunteer_applications (person_id, name, email, phone, role_interest, availability, status, reference_code)
  values (v_person_applicant, 'Morgan Ellis', 'morgan.ellis@example.test', '555-0105', 'Ride Buddy', 'Weekend mornings', 'new', 'MRGNELLS');

  insert into public.people (name, is_anonymous, source_type, email, phone, is_volunteer, created_by)
  values ('Taylor Kim', false, 'individual', 'taylor.kim@example.test', '555-0106', true, v_admin_id)
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
    'active', 'public', v_admin_id, 'https://example.test/events/winter-gear-swap', v_admin_id
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
    'Confirm final registration link and accessibility details.', v_admin_id, v_admin_id, 14,
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
  insert into public.minutes (meeting_id, body_text, created_by)
  values (v_meeting_id, 'Approved the winter access program launch plan.', v_admin_id);
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
