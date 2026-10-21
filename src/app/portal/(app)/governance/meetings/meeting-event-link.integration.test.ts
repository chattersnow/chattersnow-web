// Integration test (#1622): a governance meeting linked to an event, through
// the real create/update actions and the composite (tenant_id, event_id)
// foreign key. Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  createPublishedEvent,
  serviceRoleClient,
  signIn,
} from "../../../../../../test/integration-setup";

mock.module("next/cache", () => ({ revalidatePath: mock(() => {}) }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const {
  createMeetingAction,
  updateMeetingAction,
  listEventMeetingsAction,
  listMeetingEventOptionsAction,
} = await import("./actions");

function meetingForm(eventId: string) {
  const fd = new FormData();
  fd.set("meetingDate", new Date(Date.now() + 7 * 86_400_000).toISOString());
  fd.set("meetingType", "committee");
  fd.set("status", "scheduled");
  fd.set("eventId", eventId);
  return fd;
}

async function meetingEventId(id: string) {
  const { data, error } = await adminClient
    .from("governance_meetings")
    .select("event_id")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data.event_id;
}

describe("meeting event link (integration)", () => {
  const meetingIds: string[] = [];

  beforeAll(async () => {
    currentSupabase = await signIn(SEEDED_USERS.admin);
  });

  afterAll(async () => {
    if (meetingIds.length > 0) {
      await adminClient
        .from("governance_meetings")
        .delete()
        .in("id", meetingIds);
    }
  });

  async function create(eventId: string) {
    const result = await createMeetingAction(meetingForm(eventId));
    if (!("id" in result) || !result.id)
      throw new Error(JSON.stringify(result));
    meetingIds.push(result.id);
    return result.id;
  }

  test("creates, lists and updates a meeting with an event", async () => {
    const first = await createPublishedEvent();
    const second = await createPublishedEvent();
    try {
      const id = await create(first.id);
      expect(await meetingEventId(id)).toBe(first.id);

      const options = await listMeetingEventOptionsAction();
      expect(options.map((event) => event.id)).toContain(first.id);

      const linked = await listEventMeetingsAction(first.id);
      expect(linked.map((meeting) => meeting.id)).toEqual([id]);

      expect(await updateMeetingAction(id, meetingForm(second.id))).toEqual({
        success: true,
      });
      expect(await meetingEventId(id)).toBe(second.id);

      expect(await updateMeetingAction(id, meetingForm(""))).toEqual({
        success: true,
      });
      expect(await meetingEventId(id)).toBeNull();
    } finally {
      await first.cleanup();
      await second.cleanup();
    }
  });

  test("deleting the event clears the link and keeps the meeting", async () => {
    const event = await createPublishedEvent();
    const id = await create(event.id);

    await event.cleanup();

    expect(await meetingEventId(id)).toBeNull();
  });

  test("a coordinator without governance access sees no linked meetings", async () => {
    const event = await createPublishedEvent();
    try {
      await create(event.id);
      currentSupabase = await signIn(SEEDED_USERS.coordinator);
      expect(await listEventMeetingsAction(event.id)).toEqual([]);
      expect(await listMeetingEventOptionsAction()).toEqual([]);
    } finally {
      currentSupabase = await signIn(SEEDED_USERS.admin);
      await event.cleanup();
    }
  });

  // The second tenant is suspended, so the sole-active-tenant default the
  // rest of the suite relies on keeps resolving while it exists.
  describe("another tenant's event", () => {
    const service = serviceRoleClient();
    const run = crypto.randomUUID().slice(0, 8);
    let tenantId: string;
    let otherEventId: string;

    beforeAll(async () => {
      const { data: tenant, error } = await service
        .from("tenants")
        .insert({
          name: `Meeting Event Isolation ${run}`,
          slug: `meeting-event-isolation-${run}`,
          status: "suspended",
        })
        .select("id")
        .single();
      if (error) throw error;
      tenantId = tenant.id as string;

      const {
        data: { user },
      } = await adminClient.auth.getUser();

      const { data: event, error: eventError } = await service
        .from("events")
        .insert({
          tenant_id: tenantId,
          created_by: user!.id,
          name: `Other tenant event ${run}`,
          starts_at: new Date(Date.now() + 86_400_000).toISOString(),
          timezone: "America/Chicago",
          visibility: "private",
          status: "draft",
        })
        .select("id")
        .single();
      if (eventError) throw eventError;
      otherEventId = event.id as string;
    });

    afterAll(async () => {
      await service.from("events").delete().eq("id", otherEventId);
      // A new tenant is provisioned with retention policies of its own.
      await service
        .from("retention_policies")
        .delete()
        .eq("tenant_id", tenantId);
      const { error } = await service
        .from("tenants")
        .delete()
        .eq("id", tenantId);
      if (error) throw error;
    });

    test("is rejected on create and on update", async () => {
      expect(await createMeetingAction(meetingForm(otherEventId))).toEqual({
        error: "Could not schedule this meeting. Please try again.",
      });

      const ownEvent = await createPublishedEvent();
      try {
        const id = await create(ownEvent.id);
        expect(
          await updateMeetingAction(id, meetingForm(otherEventId)),
        ).toEqual({
          error: "Could not update this meeting. Please try again.",
        });
        expect(await meetingEventId(id)).toBe(ownEvent.id);

        // The database itself refuses it, whatever writes it.
        const { error } = await service
          .from("governance_meetings")
          .update({ event_id: otherEventId })
          .eq("id", id);
        expect(error?.code).toBe("23503");
      } finally {
        await ownEvent.cleanup();
      }
    });
  });
});
