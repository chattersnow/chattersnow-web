// Integration test (#1648): marking registrants added to the event's group
// chat, through setRegistrationsGroupChatAction() and the
// set_registrations_group_chat() RPC behind it, against a real local stack.
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  createPublishedEvent,
  serviceRoleClient,
  signInAs,
  uniqueEmail,
} from "../../../../../test/integration-setup";

mock.module("next/cache", () => ({ revalidatePath: mock(() => {}) }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const { listEventRegistrantsAction, setRegistrationsGroupChatAction } =
  await import("./registrants-actions");

async function seedRegistration(eventId: string, cancelled = false) {
  const { data, error } = await adminClient
    .from("event_registrations")
    .insert({
      event_id: eventId,
      name: "Group Chat Registrant",
      email: uniqueEmail("group-chat"),
      party_size: 1,
      ...(cancelled
        ? {
            cancelled_at: new Date().toISOString(),
            cancellation_reason: "not_attending",
          }
        : {}),
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

async function enableGroupChat(eventId: string, enabled = true) {
  const { error } = await adminClient
    .from("events")
    .update({
      group_chat_enabled: enabled,
      group_chat_label: "Instagram group chat",
    })
    .eq("id", eventId);
  if (error) throw error;
}

async function addedAt(registrationId: string) {
  const { data, error } = await adminClient
    .from("event_registrations")
    .select("group_chat_added_at, group_chat_added_by")
    .eq("id", registrationId)
    .single();
  if (error) throw error;
  return data;
}

describe("group chat flag (integration)", () => {
  test("marks one or many, keeps an earlier date, and lists who and when", async () => {
    const event = await createPublishedEvent();
    try {
      await enableGroupChat(event.id);
      const first = await seedRegistration(event.id);
      const second = await seedRegistration(event.id);
      const cancelled = await seedRegistration(event.id, true);
      currentSupabase = await signInAs(SEEDED_USERS.admin);

      expect(
        await setRegistrationsGroupChatAction({
          eventId: event.id,
          registrationIds: [first],
          added: true,
        }),
      ).toEqual({ success: true, changed: 1 });
      const firstAdded = (await addedAt(first)).group_chat_added_at;

      // Both, one already in: only the other changes, and the first keeps
      // its date. A cancelled registration can be marked too.
      expect(
        await setRegistrationsGroupChatAction({
          eventId: event.id,
          registrationIds: [first, second, cancelled],
          added: true,
        }),
      ).toEqual({ success: true, changed: 2 });
      expect((await addedAt(first)).group_chat_added_at).toBe(firstAdded);

      const listed = await listEventRegistrantsAction(event.id);
      if (!("data" in listed)) throw new Error("expected data");
      expect(listed.data.groupChat).toEqual({ label: "Instagram group chat" });
      const row = listed.data.registrants.find((r) => r.id === second)!;
      expect(row.group_chat_added_at).not.toBeNull();
      expect(row.group_chat_added_by_name).toBeTruthy();
      // Cancelled keeps the flag, which is how staff see who to remove.
      expect(
        listed.data.cancelled.find((r) => r.id === cancelled)!
          .group_chat_added_at,
      ).not.toBeNull();

      expect(
        await setRegistrationsGroupChatAction({
          eventId: event.id,
          registrationIds: [second],
          added: false,
        }),
      ).toEqual({ success: true, changed: 1 });
      expect(await addedAt(second)).toEqual({
        group_chat_added_at: null,
        group_chat_added_by: null,
      });
    } finally {
      await event.cleanup();
    }
  });

  test("an event with the switch off has no group chat to mark", async () => {
    const event = await createPublishedEvent();
    try {
      const registration = await seedRegistration(event.id);
      currentSupabase = await signInAs(SEEDED_USERS.admin);

      const listed = await listEventRegistrantsAction(event.id);
      if (!("data" in listed)) throw new Error("expected data");
      expect(listed.data.groupChat).toBeNull();

      const result = await setRegistrationsGroupChatAction({
        eventId: event.id,
        registrationIds: [registration],
        added: true,
      });
      expect(result).toMatchObject({ error: { code: "conflict" } });
      expect((await addedAt(registration)).group_chat_added_at).toBeNull();
    } finally {
      await event.cleanup();
    }
  });

  test("events: view reads the flag and cannot set it", async () => {
    const event = await createPublishedEvent();
    try {
      await enableGroupChat(event.id);
      const registration = await seedRegistration(event.id);
      // `volunteer` holds events at `view`.
      const volunteer = await signInAs(SEEDED_USERS.volunteer);
      currentSupabase = volunteer;

      expect(
        await setRegistrationsGroupChatAction({
          eventId: event.id,
          registrationIds: [registration],
          added: true,
        }),
      ).toMatchObject({ error: { code: "forbidden" } });

      // And straight at the RPC, past the action's own check.
      const { error } = await volunteer.rpc("set_registrations_group_chat", {
        p_event_id: event.id,
        p_registration_ids: [registration],
        p_added: true,
      });
      expect(error?.message).toBe("Not authorized to update registrations");
      expect((await addedAt(registration)).group_chat_added_at).toBeNull();

      const listed = await listEventRegistrantsAction(event.id);
      if (!("data" in listed)) throw new Error("expected data");
      expect(listed.data.registrants[0]).toHaveProperty(
        "group_chat_added_at",
        null,
      );
    } finally {
      await event.cleanup();
    }
  });

  test("refuses a registration from another event, all or nothing", async () => {
    const event = await createPublishedEvent();
    const other = await createPublishedEvent();
    try {
      await enableGroupChat(event.id);
      const mine = await seedRegistration(event.id);
      const theirs = await seedRegistration(other.id);

      const { error } = await adminClient.rpc("set_registrations_group_chat", {
        p_event_id: event.id,
        p_registration_ids: [mine, theirs],
        p_added: true,
      });
      expect(error?.message).toBe("REGISTRANT_NOT_FOUND");
      expect((await addedAt(mine)).group_chat_added_at).toBeNull();
      expect((await addedAt(theirs)).group_chat_added_at).toBeNull();
    } finally {
      await event.cleanup();
      await other.cleanup();
    }
  });
});

// Another tenant's event and registration, written with the service role.
// Suspended, so the sole-active-tenant default the rest of the suite relies
// on keeps resolving while it exists.
describe("group chat flag across tenants (integration)", () => {
  const service = serviceRoleClient();
  const run = crypto.randomUUID().slice(0, 8);
  let otherTenantId: string;
  let otherEventId: string;
  let otherRegistrationId: string;

  beforeAll(async () => {
    const { data: tenant, error } = await service
      .from("tenants")
      .insert({
        name: `Group Chat Isolation ${run}`,
        slug: `group-chat-isolation-${run}`,
        status: "suspended",
      })
      .select("id")
      .single();
    if (error) throw error;
    otherTenantId = tenant.id as string;

    const {
      data: { user },
    } = await adminClient.auth.getUser();
    const { data: event, error: eventError } = await service
      .from("events")
      .insert({
        tenant_id: otherTenantId,
        created_by: user!.id,
        name: `Other tenant event ${run}`,
        starts_at: new Date(Date.now() + 86_400_000).toISOString(),
        timezone: "America/Chicago",
        group_chat_enabled: true,
      })
      .select("id")
      .single();
    if (eventError) throw eventError;
    otherEventId = event.id as string;

    const { data: registration, error: registrationError } = await service
      .from("event_registrations")
      .insert({
        tenant_id: otherTenantId,
        event_id: otherEventId,
        name: "Other tenant registrant",
        email: uniqueEmail("group-chat-other"),
        party_size: 1,
      })
      .select("id")
      .single();
    if (registrationError) throw registrationError;
    otherRegistrationId = registration.id as string;
  });

  afterAll(async () => {
    await service
      .from("event_registrations")
      .delete()
      .eq("id", otherRegistrationId);
    await service.from("events").delete().eq("id", otherEventId);
    await service
      .from("retention_policies")
      .delete()
      .eq("tenant_id", otherTenantId);
    const { error } = await service
      .from("tenants")
      .delete()
      .eq("id", otherTenantId);
    if (error) throw error;
  });

  async function otherFlag() {
    const { data, error } = await service
      .from("event_registrations")
      .select("group_chat_added_at")
      .eq("id", otherRegistrationId)
      .single();
    if (error) throw error;
    return data.group_chat_added_at;
  }

  test("cannot mark another tenant's registrations", async () => {
    // Their event, by id.
    const byEvent = await adminClient.rpc("set_registrations_group_chat", {
      p_event_id: otherEventId,
      p_registration_ids: [otherRegistrationId],
      p_added: true,
    });
    expect(byEvent.error?.message).toBe("EVENT_NOT_FOUND");

    // Our own event, their registration.
    const event = await createPublishedEvent();
    try {
      await enableGroupChat(event.id);
      const byRegistration = await adminClient.rpc(
        "set_registrations_group_chat",
        {
          p_event_id: event.id,
          p_registration_ids: [otherRegistrationId],
          p_added: true,
        },
      );
      expect(byRegistration.error?.message).toBe("REGISTRANT_NOT_FOUND");
    } finally {
      await event.cleanup();
    }

    expect(await otherFlag()).toBeNull();
  });
});
