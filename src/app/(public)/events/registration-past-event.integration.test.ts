// Integration test for #1609 against a local Supabase stack: `completed` is
// gone, so a finished event stays published and listed on the public site --
// which means registration has to close on the event's own dates, not only on
// `registration_deadline`, or a past event with no deadline reopens.
// Requires `bun run db:start && bun run db:reset`; run via
// `bun run test:integration`.
import { afterAll, describe, expect, test } from "bun:test";
import {
  adminClient,
  anonClient,
  createPublishedEvent,
  serviceRoleClient,
  uniqueEmail,
  uniqueIp,
} from "../../../../test/integration-setup";

const service = serviceRoleClient();
const run = crypto.randomUUID().slice(0, 8);
const hour = 60 * 60 * 1000;
const at = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

const past = await createPublishedEvent({
  name: `Past event ${run}`,
  startsAt: at(-26 * hour),
  endsAt: at(-24 * hour),
});
const pastNoEnd = await createPublishedEvent({
  name: `Past event, no end ${run}`,
  startsAt: at(-2 * hour),
  endsAt: null,
});
const running = await createPublishedEvent({
  name: `Running event ${run}`,
  startsAt: at(-hour),
  endsAt: at(hour),
});
const emails: string[] = [];

afterAll(async () => {
  await Promise.all([past, pastNoEnd, running].map((e) => e.cleanup()));
  if (emails.length) await service.from("people").delete().in("email", emails);
});

async function register(eventId: string) {
  const email = uniqueEmail(`past-event-${run}`);
  emails.push(email);
  const { error } = await anonClient().rpc("register_for_event", {
    p_event_id: eventId,
    p_name: "Past Event Registrant",
    p_email: email,
    p_phone: null,
    p_party_size: 1,
    p_notes: null,
    p_ip_address: uniqueIp(),
  } as never);
  return error;
}

describe("a past published public event", () => {
  test("stays on the public site", async () => {
    const { data, error } = await anonClient()
      .from("public_events")
      .select("id")
      .eq("id", past.id);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  test("refuses registration with no deadline set", async () => {
    expect((await register(past.id))?.message).toBe(
      "REGISTRATION_DEADLINE_PASSED",
    );
  });

  test("with no end time, refuses registration once it has started", async () => {
    expect((await register(pastNoEnd.id))?.message).toBe(
      "REGISTRATION_DEADLINE_PASSED",
    );
  });
});

test("an event still running accepts registration", async () => {
  expect(await register(running.id)).toBeNull();
});

test("completed is no longer an event status", async () => {
  const { error } = await adminClient
    .from("events")
    .update({ status: "completed" })
    .eq("id", running.id);
  expect(error?.code).toBe("23514");
});
