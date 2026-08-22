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

with new_users(email) as (
  values
    ('admin@example.test'),
    ('coordinator@example.test'),
    ('finance@example.test'),
    ('board@example.test'),
    ('volunteer@example.test'),
    ('multi@example.test'),
    ('noaccess@example.test')
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
    now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
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
  (u.email = 'multi@example.test' and r.name in ('event_coordinator', 'volunteer'))
)
where u.email in (
  'admin@example.test', 'coordinator@example.test', 'finance@example.test',
  'board@example.test', 'volunteer@example.test', 'multi@example.test'
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
begin
  select id into v_admin_id from auth.users where email = 'admin@example.test';

  -- People: donors, a sponsor org, and a volunteer.
  insert into public.people (name, is_anonymous, source_type, email, phone, notes, is_donor, created_by)
  values ('Jamie Rivera', false, 'individual', 'jamie.rivera@example.test', '555-0101', null, true, v_admin_id)
  returning id into v_person_donor1;

  insert into public.people (name, is_anonymous, source_type, email, phone, notes, is_donor, created_by)
  values ('Alex Chen', false, 'individual', 'alex.chen@example.test', '555-0102', null, true, v_admin_id)
  returning id into v_person_donor2;

  insert into public.people (name, is_anonymous, source_type, email, phone, notes, is_sponsor, created_by)
  values ('Summit Outdoor Co.', false, 'brand', 'partnerships@summitoutdoor.example.test', '555-0103', 'Local gear retailer, annual sponsor.', true, v_admin_id)
  returning id into v_person_sponsor;

  insert into public.people (name, is_anonymous, source_type, email, phone, notes, is_volunteer, created_by)
  values ('Priya Natarajan', false, 'individual', 'priya.n@example.test', '555-0104', null, true, v_admin_id)
  returning id into v_person_volunteer;

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
  insert into public.event_expenses (event_id, description, expense_date, amount, currency, notes, created_by)
  values (v_event_past, 'Trail signage and supplies', current_date - 40, 86.42, 'USD', null, v_admin_id);

  insert into public.event_expenses (event_id, description, expense_date, amount, currency, notes, created_by)
  values (null, 'Storage unit rental — October', current_date - 10, 120.00, 'USD', 'Monthly inventory storage.', v_admin_id);

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

  -- Giveaway for the past event: two prizes, one claimed winner.
  insert into public.giveaways (event_id, name, tickets_sold, ticket_price, revenue_amount, drawing_date, created_by)
  values (v_event_past, 'Trailhead Cleanup Giveaway', 142, 5.00, 710.00, now() - interval '40 days', v_admin_id)
  returning id into v_giveaway_id;

  insert into public.giveaway_prizes (giveaway_id, prize_name, donor_name, estimated_value, created_by)
  values (v_giveaway_id, 'Weekend cabin stay', 'Summit Outdoor Co.', 400.00, v_admin_id)
  returning id into v_prize1;

  insert into public.giveaway_prizes (giveaway_id, prize_name, donor_name, estimated_value, created_by)
  values (v_giveaway_id, 'Gift basket', 'Local Roasters Coffee', 60.00, v_admin_id)
  returning id into v_prize2;

  insert into public.giveaway_winners (giveaway_prize_id, winner_name, winner_contact, distribution_status, distributed_at, created_by)
  values (v_prize1, 'M. Alvarez', '555-0199', 'distributed', now() - interval '38 days', v_admin_id);

  insert into public.giveaway_winners (giveaway_prize_id, winner_name, distribution_status, created_by)
  values (v_prize2, 'T. Nguyen', 'pending', v_admin_id);
end $$;
