// Shared fixtures for *.integration.test.ts files, which run against a real
// local Supabase stack (`bun run db:start && bun run db:reset`) rather than
// mocking the Supabase client. Run via `bun run test:integration`.
import { createClient } from "@supabase/supabase-js";

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

// A signed-in admin session, used for fixture setup/cleanup. Not the raw
// service-role client: `service_role` has `bypassrls` but this schema's
// migrations only ever GRANT table privileges to `authenticated` (never to
// `service_role`), so a raw service-role client gets "permission denied"
// on ordinary tables -- it can only reach RPCs and tables granted directly
// to it. Signing in as the seeded admin account (which has "manage" on
// every resource) exercises the same authenticated+RLS path the app
// actually uses and has access to everything fixtures need.
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
  visibility?: "public" | "private";
  status?: "draft" | "published" | "completed" | "cancelled" | "archived";
  registration_enabled?: boolean;
  registration_deadline?: string | null;
  capacity?: number | null;
};

export async function createPublishedEvent(overrides: EventOverrides = {}) {
  const { data, error } = await adminClient
    .from("events")
    .insert({
      name: `Integration test event ${crypto.randomUUID()}`,
      starts_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      timezone: "America/Chicago",
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
