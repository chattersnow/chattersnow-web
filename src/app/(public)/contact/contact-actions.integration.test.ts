// Integration test: exercises the real submitContactMessageAction against a
// real local Supabase stack (submit_contact_message RPC, honeypot, rate
// limiting). anon has no direct access to contact_messages, so every check
// the RPC makes is only observable through this path -- a mocked client
// can't catch a honeypot or rate-limit regression that lives in SQL.
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterEach, describe, expect, mock, test } from "bun:test";
import {
  anonClient,
  deleteContactMessages,
  findContactMessages,
  uniqueEmail,
  uniqueIp,
} from "../../../../test/integration-setup";

let currentIp: string | null = null;
mock.module("@/lib/get-client-ip", () => ({
  getClientIp: async () => currentIp,
}));

mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => anonClient(),
}));

const { submitContactMessageAction } = await import("./contact-actions");

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

// Every email a test submits, cleaned up afterwards. Deleting by email is a
// no-op for the cases that expect no row, so tests can register an address
// before knowing whether it made it into the table.
const submittedEmails: string[] = [];
function contactEmail(tag: string) {
  const email = uniqueEmail(tag);
  submittedEmails.push(email);
  return email;
}

afterEach(async () => {
  while (submittedEmails.length) {
    await deleteContactMessages(submittedEmails.pop()!);
  }
});

describe("submitContactMessageAction (integration)", () => {
  test("stores a message from an anonymous visitor", async () => {
    currentIp = uniqueIp();
    const email = contactEmail("happy-path");

    const result = await submitContactMessageAction(
      formData({
        name: "Jamie Rivera",
        email,
        topic: "volunteering",
        message: "I'd love to help out this season.",
      }),
    );

    expect(result).toEqual({ success: true });
    const messages = await findContactMessages(email);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      name: "Jamie Rivera",
      topic: "volunteering",
      message: "I'd love to help out this season.",
    });
  });

  test("silently no-ops when the honeypot field is filled", async () => {
    currentIp = uniqueIp();
    const email = contactEmail("honeypot");

    const result = await submitContactMessageAction(
      formData({
        name: "A Bot",
        email,
        topic: "general",
        message: "Cheap watches.",
        company: "Definitely A Company",
      }),
    );

    // The RPC reports fake success to avoid tipping off bots, but nothing is
    // inserted -- only a DB check can catch a regression here.
    expect(result).toEqual({ success: true });
    expect(await findContactMessages(email)).toHaveLength(0);
  });

  test("rejects an email the RPC considers invalid but the parser let through", async () => {
    currentIp = uniqueIp();

    // The form parser only requires an "@"; the RPC additionally requires a
    // dot-suffixed domain. This asserts the RPC's stricter check is the
    // authoritative one and that its error code reaches the user.
    const result = await submitContactMessageAction(
      formData({
        name: "Jamie Rivera",
        email: "jamie@example",
        topic: "general",
        message: "Hello there.",
      }),
    );

    expect(result).toEqual({ error: "A valid email is required." });
    expect(await findContactMessages("jamie@example")).toHaveLength(0);
  });

  test("rate-limits repeated submissions from the same IP", async () => {
    currentIp = uniqueIp();
    // No per-email throttle on contact messages, so one address is enough to
    // walk the per-IP window (5 per 15 minutes).
    const email = contactEmail("rate-limit");

    for (let i = 0; i < 5; i++) {
      const result = await submitContactMessageAction(
        formData({
          name: "Repeat Sender",
          email,
          topic: "general",
          message: `Message ${i}`,
        }),
      );
      expect(result).toEqual({ success: true });
    }

    const limited = await submitContactMessageAction(
      formData({
        name: "Repeat Sender",
        email,
        topic: "general",
        message: "One too many",
      }),
    );

    expect(limited).toEqual({
      error: "Too many attempts — please try again in a few minutes.",
    });
    expect(await findContactMessages(email)).toHaveLength(5);
  });
});
