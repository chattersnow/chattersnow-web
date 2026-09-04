// Shared fixtures for *.integration.test.ts files, which run against a real
// local Supabase stack (`bun run db:start && bun run db:reset`) rather than
// mocking the Supabase client. Run via `bun run test:integration`.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

// Every client here disables session persistence/auto-refresh: supabase-js's
// default storage adapter keys sessions by URL, not by client instance, so
// without this every createClient() call against the same local stack
// would share (and leak) whichever session was signed in most recently.
export function anonClient() {
  return createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export async function signIn(email: string, password = "password123") {
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

const roleClients = new Map<string, Promise<SupabaseClient>>();

// Memoized signIn(): GoTrue rate-limits sign-ins per IP over a 5-minute
// window (auth.rate_limit.sign_in_sign_ups in supabase/config.toml), and a
// seeded role account's session carries no per-test state, so files that
// exercise a whole permission matrix should reuse one client per account
// instead of re-authenticating in every case.
export function signInAs(email: string): Promise<SupabaseClient> {
  let client = roleClients.get(email);
  if (!client) {
    client = signIn(email);
    roleClients.set(email, client);
  }
  return client;
}

// The 8 fixed accounts seeded by supabase/seed.sql (local stack only),
// all password "password123".
export const SEEDED_USERS = {
  admin: "admin@example.test",
  coordinator: "coordinator@example.test",
  finance: "finance@example.test",
  board: "board@example.test",
  volunteer: "volunteer@example.test",
  multi: "multi@example.test",
  noAccess: "noaccess@example.test",
  former: "former@example.test",
} as const;

// A signed-in admin session, used for fixture setup/cleanup, rather than the
// raw service-role client (createSupabaseAdminClient() in
// src/lib/supabase/admin.ts -- usable for direct table access since #221's
// grant migration, but still not what fixtures should exercise): signing in
// as the seeded admin account (which has "manage" on every resource)
// exercises the same authenticated+RLS path the app actually uses and has
// access to everything fixtures need.
export const adminClient = await signIn(SEEDED_USERS.admin);

// Random, not sequential: the rate limiter keys on (route, ip) over a
// 15-minute window, so a counter that restarts at 1 on every process would
// collide with IPs used by a previous run within that window.
export function uniqueIp() {
  const octet = () => Math.floor(Math.random() * 256);
  return `10.${octet()}.${octet()}.${octet()}`;
}

export function uniqueEmail(tag: string) {
  return `it-${tag}-${crypto.randomUUID()}@example.test`;
}

type EventOverrides = {
  name?: string;
  visibility?: "public" | "private";
  status?: "draft" | "published" | "completed" | "cancelled" | "archived";
  registration_enabled?: boolean;
  registration_deadline?: string | null;
  capacity?: number | null;
  auto_assign_discount_codes?: boolean;
  startsAt?: string;
  endsAt?: string | null;
  timezone?: string;
};

export async function createPublishedEvent(overrides: EventOverrides = {}) {
  const name =
    overrides.name ?? `Integration test event ${crypto.randomUUID()}`;
  const { data, error } = await adminClient
    .from("events")
    .insert({
      name,
      starts_at:
        overrides.startsAt ??
        new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      ends_at: overrides.endsAt ?? null,
      timezone: overrides.timezone ?? "America/Chicago",
      visibility: overrides.visibility ?? "public",
      status: overrides.status ?? "published",
      registration_enabled: overrides.registration_enabled ?? true,
      registration_deadline: overrides.registration_deadline ?? null,
      capacity: overrides.capacity ?? null,
      auto_assign_discount_codes: overrides.auto_assign_discount_codes ?? false,
    })
    .select("id")
    .single();
  if (error) throw error;

  const id = data.id as string;
  return {
    id,
    name,
    // event_registrations references events with `on delete cascade`, so
    // deleting the event is sufficient cleanup for its registrations too.
    async cleanup() {
      await adminClient.from("events").delete().eq("id", id);
    },
  };
}

export async function countEventRegistrations(eventId: string, email: string) {
  const { data, error } = await adminClient
    .from("event_registrations")
    .select("id")
    .eq("event_id", eventId)
    .ilike("email", email);
  if (error) throw error;
  return data.length;
}

export async function cleanupDonation(donationId: string) {
  const { data: donation } = await adminClient
    .from("donations")
    .select("donor_id")
    .eq("id", donationId)
    .single();

  const { data: items } = await adminClient
    .from("inventory_items")
    .select("id")
    .eq("donation_id", donationId);
  const itemIds = (items ?? []).map((item) => item.id as string);
  if (itemIds.length) {
    await adminClient
      .from("inventory_movements")
      .delete()
      .in("inventory_item_id", itemIds);
  }
  await adminClient
    .from("inventory_items")
    .delete()
    .eq("donation_id", donationId);
  await adminClient.from("donations").delete().eq("id", donationId);

  // Each test's donation gets its own fresh (email-less, so never deduped)
  // `people` row -- safe to delete once nothing references it any more.
  if (donation?.donor_id) {
    await adminClient.from("people").delete().eq("id", donation.donor_id);
  }
}

// Creates `count` fresh, available inventory items via the real
// create_donation_with_items RPC (same path portal donation intake uses),
// for tests exercising the public gear request/cart flows.
export async function createAvailableGearItems(
  count: number,
  overrides: {
    categoryKey?: string;
    condition?: string;
    intendedUse?: string;
  } = {},
) {
  const items = Array.from({ length: count }, () => ({
    description: `Integration test item ${crypto.randomUUID()}`,
    category_key: overrides.categoryKey ?? "snowboard",
    condition: overrides.condition ?? "good",
    intended_use: overrides.intendedUse ?? "gear_library",
  }));

  const { data, error } = await adminClient.rpc("create_donation_with_items", {
    p_donor_name: `Integration Test Donor ${crypto.randomUUID()}`,
    p_donor_is_anonymous: false,
    p_donor_source_type: "individual",
    p_donor_email: null,
    p_donor_phone: null,
    p_donor_notes: null,
    p_items: items,
  });
  if (error) throw error;

  const row = data![0] as { donation_id: string; inventory_item_ids: string[] };
  return {
    itemIds: row.inventory_item_ids,
    async cleanup() {
      await cleanupDonation(row.donation_id);
    },
  };
}

// A single fresh `donations` row (with its one backing item and donor
// `people` row), for tests exercising `donations` table access directly --
// unlike createAvailableGearItems, this exposes the donation id itself
// rather than just its items' ids.
export async function createDonation() {
  const { data, error } = await adminClient.rpc("create_donation_with_items", {
    p_donor_name: `Integration Test Donor ${crypto.randomUUID()}`,
    p_donor_is_anonymous: false,
    p_donor_source_type: "individual",
    p_donor_email: null,
    p_donor_phone: null,
    p_donor_notes: null,
    p_items: [
      {
        description: `Integration test item ${crypto.randomUUID()}`,
        category_key: "jacket",
        condition: "good",
      },
    ],
  });
  if (error) throw error;

  const row = data![0] as { donation_id: string };
  return {
    id: row.donation_id,
    async cleanup() {
      await cleanupDonation(row.donation_id);
    },
  };
}

// A single fresh `monetary_donations` row (a cash gift, not in-kind intake),
// for tests exercising the Finance > Donations actions and the finance
// report rollup. Anonymous by default (donor_id null); pass overrides to
// link a donor or event, or to place it in a specific reporting period.
export async function createMonetaryDonation(
  overrides: {
    donorId?: string | null;
    eventId?: string | null;
    amount?: number;
    method?: string;
    receivedDate?: string;
    notes?: string | null;
  } = {},
) {
  const { data, error } = await adminClient
    .from("monetary_donations")
    .insert({
      donor_id: overrides.donorId ?? null,
      event_id: overrides.eventId ?? null,
      amount: overrides.amount ?? 25,
      method: overrides.method ?? "cash",
      received_date:
        overrides.receivedDate ?? new Date().toISOString().slice(0, 10),
      notes: overrides.notes ?? `Integration test gift ${crypto.randomUUID()}`,
    })
    .select("id")
    .single();
  if (error) throw error;

  const id = data.id as string;
  return {
    id,
    async cleanup() {
      await adminClient.from("monetary_donations").delete().eq("id", id);
    },
  };
}

type CalendarItemOverrides = {
  title?: string;
  itemType?: string;
  startsAt?: string;
  timeZone?: string;
  priorityTier?: 1 | 2 | 3;
  calendarStatus?: "idea" | "active" | "complete" | "archived";
  visibility?: "public" | "internal" | "unlisted_draft";
  isSensitiveTopic?: boolean;
  toneGuidance?: string | null;
  categories?: string[];
  seriesKey?: string | null;
  recurrenceStartMonth?: number | null;
  recurrenceStartDay?: number | null;
  recurrenceEndMonth?: number | null;
  recurrenceEndDay?: number | null;
  recurrenceEndIsMonthEnd?: boolean;
};

// A fresh `calendar_items` row, for the content/community calendar action
// tests. Junction rows (categories/programs/links) and the item's
// content_opportunities row all reference calendar_items with
// `on delete cascade`, so deleting the item is sufficient cleanup.
export async function createCalendarItem(
  overrides: CalendarItemOverrides = {},
) {
  const { data, error } = await adminClient
    .from("calendar_items")
    .insert({
      title:
        overrides.title ??
        `Integration test calendar item ${crypto.randomUUID()}`,
      item_type: overrides.itemType ?? "community_observance",
      starts_at:
        overrides.startsAt ??
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      time_zone: overrides.timeZone ?? "America/Denver",
      priority_tier: overrides.priorityTier ?? 3,
      calendar_status: overrides.calendarStatus ?? "idea",
      visibility: overrides.visibility ?? "internal",
      is_sensitive_topic: overrides.isSensitiveTopic ?? false,
      tone_guidance: overrides.toneGuidance ?? null,
      series_key: overrides.seriesKey ?? null,
      recurrence_start_month: overrides.recurrenceStartMonth ?? null,
      recurrence_start_day: overrides.recurrenceStartDay ?? null,
      recurrence_end_month: overrides.recurrenceEndMonth ?? null,
      recurrence_end_day: overrides.recurrenceEndDay ?? null,
      recurrence_end_is_month_end: overrides.recurrenceEndIsMonthEnd ?? false,
    })
    .select("id")
    .single();
  if (error) throw error;

  const id = data.id as string;
  if (overrides.categories?.length) {
    const { error: categoryError } = await adminClient
      .from("calendar_item_categories")
      .insert(
        overrides.categories.map((category) => ({ item_id: id, category })),
      );
    if (categoryError) throw categoryError;
  }

  return {
    id,
    async cleanup() {
      await adminClient.from("calendar_items").delete().eq("id", id);
    },
  };
}

// A content_opportunities row for an existing calendar item (one-to-one),
// for tests exercising the content-permission (consent) actions. Its
// content_permissions row references it with `on delete cascade`, and the
// row itself cascades from the calendar item, so callers usually only need
// the parent item's cleanup.
export async function createContentOpportunity(calendarItemId: string) {
  const { data, error } = await adminClient
    .from("content_opportunities")
    .insert({ calendar_item_id: calendarItemId, content_status: "idea" })
    .select("id")
    .single();
  if (error) throw error;

  const id = data.id as string;
  return {
    id,
    async cleanup() {
      await adminClient.from("content_opportunities").delete().eq("id", id);
    },
  };
}

// A fresh `programs` row, for tests that need a valid program FK target
// (e.g. calendar_program_suggestion_rules) without colliding with seeded
// rules on the seeded program.
export async function createProgram() {
  const { data, error } = await adminClient
    .from("programs")
    .insert({
      name: `Integration Test Program ${crypto.randomUUID()}`,
      status: "active",
    })
    .select("id")
    .single();
  if (error) throw error;

  const id = data.id as string;
  return {
    id,
    async cleanup() {
      await adminClient.from("programs").delete().eq("id", id);
    },
  };
}

export async function getInventoryItemStatus(itemId: string) {
  const { data, error } = await adminClient
    .from("inventory_items")
    .select("status")
    .eq("id", itemId)
    .single();
  if (error) throw error;
  return data.status as string;
}

// A bare `people` row, for tests that just need a valid FK target (a
// resolution's mover/seconder, a distribution's recipient, a reimbursement's
// payee) without the donor-specific fields `createAvailableGearItems` sets up
// via `create_donation_with_items`.
export async function createPerson(overrides: { name?: string } = {}) {
  const { data, error } = await adminClient
    .from("people")
    .insert({
      name: overrides.name ?? `Integration Test Person ${crypto.randomUUID()}`,
      source_type: "individual",
    })
    .select("id")
    .single();
  if (error) throw error;

  const id = data.id as string;
  return {
    id,
    async cleanup() {
      await adminClient.from("people").delete().eq("id", id);
    },
  };
}

// A single `governance_meetings` row, for tests exercising a meeting's child
// records (agenda, minutes, action items). Every table keyed on `meeting_id`
// declares `on delete cascade`, so deleting the meeting is sufficient
// cleanup for its children too.
export async function createGovernanceMeeting(
  overrides: { meetingDate?: string; status?: string } = {},
) {
  const { data, error } = await adminClient
    .from("governance_meetings")
    .insert({
      meeting_date:
        overrides.meetingDate ??
        new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      meeting_type: "board",
      status: overrides.status ?? "scheduled",
    })
    .select("id")
    .single();
  if (error) throw error;

  const id = data.id as string;
  return {
    id,
    async cleanup() {
      await adminClient.from("governance_meetings").delete().eq("id", id);
    },
  };
}

// `contact_messages` grants `select` to authenticated and nothing else
// (20260826180000): rows only ever arrive through the SECURITY DEFINER
// submit_contact_message() RPC, so the seeded-admin client can read
// submissions but has no way to delete them. Fixture cleanup goes through
// the service-role key instead, which bypasses RLS and holds every table
// grant since #221's migration (20260826320000). Created lazily so files
// that never touch contact_messages don't need SUPABASE_SECRET_KEY set.
let serviceRoleClientInstance: SupabaseClient | null = null;
function serviceRoleClient() {
  serviceRoleClientInstance ??= createClient(
    SUPABASE_URL,
    process.env.SUPABASE_SECRET_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
  return serviceRoleClientInstance;
}

export async function findContactMessages(email: string) {
  const { data, error } = await adminClient
    .from("contact_messages")
    .select("id, name, email, topic, message")
    .ilike("email", email);
  if (error) throw error;
  return data;
}

export async function deleteContactMessages(email: string) {
  const { error } = await serviceRoleClient()
    .from("contact_messages")
    .delete()
    .ilike("email", email);
  if (error) throw error;
}

// public.user_onboarding (20260902060000) grants select/insert/update to
// authenticated and no delete, and every policy on it is self-scoped -- that
// is the whole point of the table, so a fixture genuinely cannot reach another
// account's row, or remove its own, through a signed-in client. Same situation
// as contact_messages above: these go through the service-role key instead.
// supabase/seed.sql gives every seeded account a completed tour and a
// far-future release pointer, so tests that need a different starting state
// have to set it explicitly.
export async function setOnboarding(
  userId: string,
  fields: {
    first_seen_at?: string;
    welcome_completed_at?: string | null;
    last_release_seen?: string | null;
  },
) {
  const { error } = await serviceRoleClient()
    .from("user_onboarding")
    .update(fields)
    .eq("user_id", userId);
  if (error) throw error;
}

export async function deleteOnboarding(userId: string) {
  const { error } = await serviceRoleClient()
    .from("user_onboarding")
    .delete()
    .eq("user_id", userId);
  if (error) throw error;
}

type VolunteerApplicationOverrides = {
  name?: string;
  email?: string;
  phone?: string | null;
  roleInterest?: string | null;
  availability?: string | null;
  status?: string;
};

// `volunteer_applications` has no insert grant at all -- the public
// submit_volunteer_application() RPC is the only way in (20260827010000) --
// so fixtures go through it exactly as an anonymous visitor would, then
// adjust the status afterwards when a test needs something other than the
// 'new' default.
export async function createVolunteerApplication(
  overrides: VolunteerApplicationOverrides = {},
) {
  const email = overrides.email ?? uniqueEmail("vol-app");
  const { data: referenceCode, error } = await anonClient().rpc(
    "submit_volunteer_application",
    {
      p_name:
        overrides.name ?? `Integration Test Applicant ${crypto.randomUUID()}`,
      p_email: email,
      p_phone: overrides.phone ?? null,
      p_role_interest: overrides.roleInterest ?? "Ride Buddy",
      p_availability: overrides.availability ?? "Weekends",
      p_honeypot: null,
      // A fresh IP per fixture: the RPC's own per-IP rate limit (5 per 15
      // minutes) would otherwise start rejecting fixtures partway through a
      // file that creates several.
      p_ip_address: uniqueIp(),
    },
  );
  if (error) throw error;

  // The RPC returns the applicant-facing reference code, not the row id
  // (see 20260827010000), so resolve the actual row from it.
  const { data: row, error: rowError } = await adminClient
    .from("volunteer_applications")
    .select("id")
    .eq("reference_code", referenceCode as string)
    .single();
  if (rowError) throw rowError;

  const id = row.id as string;

  if (overrides.status) {
    const { error: statusError } = await adminClient
      .from("volunteer_applications")
      .update({ status: overrides.status })
      .eq("id", id);
    if (statusError) throw statusError;
  }

  return {
    id,
    email,
    referenceCode: referenceCode as string,
    async cleanup() {
      await deleteVolunteerApplications(email);
    },
  };
}

export async function findVolunteerApplications(email: string) {
  const { data, error } = await adminClient
    .from("volunteer_applications")
    .select(
      "id, person_id, name, email, phone, role_interest, availability, reference_code, status",
    )
    .ilike("email", email);
  if (error) throw error;
  return data;
}

// Cleanup keyed on email rather than id, since a test exercising the public
// action only knows what it submitted. Also removes the backing `people` row
// resolve_or_create_person_by_email() created behind each application --
// nothing else references it once the application is gone.
export async function deleteVolunteerApplications(email: string) {
  for (const row of await findVolunteerApplications(email)) {
    await adminClient
      .from("volunteer_applications")
      .delete()
      .eq("id", row.id as string);
    await adminClient
      .from("people")
      .delete()
      .eq("id", row.person_id as string);
  }
}
