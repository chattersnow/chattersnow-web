// Integration test: exercises the real registerForEventAction against a
// real local Supabase stack (register_for_event RPC, RLS, rate limiting).
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterEach, describe, expect, mock, test } from "bun:test";
import {
  anonClient,
  countEventRegistrations,
  createPublishedEvent,
  uniqueEmail,
  uniqueIp,
} from "../../../../test/integration-setup";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

let currentIp: string | null = null;
mock.module("@/lib/get-client-ip", () => ({
  getClientIp: async () => currentIp,
}));

mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => anonClient(),
}));

const { registerForEventAction } = await import("./event-registration-actions");

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  while (cleanups.length) {
    const cleanup = cleanups.pop()!;
    await cleanup();
  }
  revalidatePathMock.mockClear();
});

async function event(overrides?: Parameters<typeof createPublishedEvent>[0]) {
  const fixture = await createPublishedEvent(overrides);
  cleanups.push(fixture.cleanup);
  return fixture;
}

describe("registerForEventAction (integration)", () => {
  test("registers for a published, open event", async () => {
    currentIp = uniqueIp();
    const { id } = await event();
    const email = uniqueEmail("happy-path");

    const result = await registerForEventAction(
      id,
      formData({ name: "Jamie Rivera", email, partySize: "2" }),
    );

    expect(result).toEqual({ success: true });
    expect(await countEventRegistrations(id, email)).toBe(1);
    expect(revalidatePathMock).toHaveBeenCalledWith(`/events/${id}`);
    expect(revalidatePathMock).toHaveBeenCalledWith("/portal/events");
  });

  test("rejects when registration is closed", async () => {
    currentIp = uniqueIp();
    const { id } = await event({ registration_enabled: false });
    const email = uniqueEmail("closed");

    const result = await registerForEventAction(
      id,
      formData({ name: "Jamie Rivera", email }),
    );

    expect(result).toEqual({
      error: "Registration is not open for this event.",
    });
    expect(await countEventRegistrations(id, email)).toBe(0);
  });

  test("rejects after the registration deadline has passed", async () => {
    currentIp = uniqueIp();
    const { id } = await event({
      registration_deadline: new Date(Date.now() - 60_000).toISOString(),
    });
    const email = uniqueEmail("deadline");

    const result = await registerForEventAction(
      id,
      formData({ name: "Jamie Rivera", email }),
    );

    expect(result).toEqual({
      error: "The registration deadline for this event has passed.",
    });
  });

  test("rejects once the event is at capacity", async () => {
    currentIp = uniqueIp();
    const { id } = await event({ capacity: 2 });
    const firstEmail = uniqueEmail("capacity-1");
    const secondEmail = uniqueEmail("capacity-2");

    const first = await registerForEventAction(
      id,
      formData({ name: "First Registrant", email: firstEmail, partySize: "2" }),
    );
    expect(first).toEqual({ success: true });

    const second = await registerForEventAction(
      id,
      formData({
        name: "Second Registrant",
        email: secondEmail,
        partySize: "1",
      }),
    );
    expect(second).toEqual({ error: "This event has reached capacity." });
    expect(await countEventRegistrations(id, secondEmail)).toBe(0);
  });

  test("rejects a duplicate registration for the same event and email", async () => {
    currentIp = uniqueIp();
    const { id } = await event();
    const email = uniqueEmail("duplicate");

    const first = await registerForEventAction(
      id,
      formData({ name: "Jamie Rivera", email }),
    );
    expect(first).toEqual({ success: true });

    const second = await registerForEventAction(
      id,
      formData({ name: "Jamie Rivera", email: email.toUpperCase() }),
    );
    expect(second).toEqual({
      error: "This email is already registered for this event.",
    });
    expect(await countEventRegistrations(id, email)).toBe(1);
  });

  test("reports EVENT_NOT_FOUND for a private/unpublished event", async () => {
    currentIp = uniqueIp();
    const { id } = await event({ visibility: "private" });
    const email = uniqueEmail("not-found");

    const result = await registerForEventAction(
      id,
      formData({ name: "Jamie Rivera", email }),
    );

    expect(result).toEqual({ error: "This event could not be found." });
  });

  test("silently no-ops when the honeypot field is filled", async () => {
    currentIp = uniqueIp();
    const { id } = await event();
    const email = uniqueEmail("honeypot");

    const result = await registerForEventAction(
      id,
      formData({ name: "A Bot", email, company: "Definitely A Company" }),
    );

    // The RPC reports fake success to avoid tipping off bots, but no row is
    // actually inserted -- only a DB check can catch a regression here.
    expect(result).toEqual({ success: true });
    expect(await countEventRegistrations(id, email)).toBe(0);
  });

  test("rate-limits repeated registrations from the same IP", async () => {
    currentIp = uniqueIp();
    const { id } = await event();

    for (let i = 0; i < 8; i++) {
      const result = await registerForEventAction(
        id,
        formData({
          name: "Repeat Registrant",
          email: uniqueEmail(`rate-${i}`),
        }),
      );
      expect(result).toEqual({ success: true });
    }

    const limited = await registerForEventAction(
      id,
      formData({ name: "Repeat Registrant", email: uniqueEmail("rate-9") }),
    );
    expect(limited).toEqual({
      error: "Too many attempts — please try again in a few minutes.",
    });
  });
});
