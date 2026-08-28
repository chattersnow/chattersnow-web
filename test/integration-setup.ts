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
  overrides: { type?: string; condition?: string } = {},
) {
  const items = Array.from({ length: count }, () => ({
    description: `Integration test item ${crypto.randomUUID()}`,
    type: overrides.type ?? "snowboard",
    condition: overrides.condition ?? "good",
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
        type: "coat",
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
