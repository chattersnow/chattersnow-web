import { describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  autoReplyDefaults,
  autoReplyDefinition,
  emptyAutoReplyCopy,
} from "./auto-replies";
import { resolveAutoReply } from "./auto-replies-resolver";

const KIND = "event_registration_confirmation";
const EVENT = autoReplyDefinition(KIND)!;
const TENANT = "11111111-1111-1111-1111-111111111111";

type Row = { enabled: unknown; slots: unknown } | null;

/** The chain resolveAutoReply() builds: from().select().eq().eq().maybeSingle(). */
function clientReturning(
  data: Row,
  error: { code: string; message: string } | null = null,
): SupabaseClient {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => ({ data, error }),
  };
  return { from: () => chain } as unknown as SupabaseClient;
}

describe("resolveAutoReply", () => {
  test("no row is the platform's wording, switched on", async () => {
    const resolved = await resolveAutoReply(
      clientReturning(null),
      TENANT,
      KIND,
    );
    expect(resolved.enabled).toBe(true);
    expect(resolved.slots).toEqual(autoReplyDefaults(EVENT));
  });

  test("a tenant's row is folded over the defaults", async () => {
    const resolved = await resolveAutoReply(
      clientReturning({
        enabled: true,
        slots: { intro: "You're in. Here's what we know:", closing: "" },
      }),
      TENANT,
      KIND,
    );
    expect(resolved.slots.intro).toBe("You're in. Here's what we know:");
    expect(resolved.slots.closing).toBe("");
    expect(resolved.slots.subject).toBe(autoReplyDefaults(EVENT).subject);
  });

  test("enabled = false is carried through", async () => {
    const resolved = await resolveAutoReply(
      clientReturning({ enabled: false, slots: {} }),
      TENANT,
      KIND,
    );
    expect(resolved.enabled).toBe(false);
  });

  test("an enabled that is not a boolean reads as on", async () => {
    const resolved = await resolveAutoReply(
      clientReturning({ enabled: null, slots: {} }),
      TENANT,
      KIND,
    );
    expect(resolved.enabled).toBe(true);
  });

  test("a read error sends the platform's wording rather than nothing", async () => {
    // The opposite of isOrgEmailEnabled(), which fails closed. The kill switch
    // decides whether mail goes out; this decides what it says, and a receipt
    // in platform English beats a receipt that never arrives with the
    // reference code in it.
    const resolved = await resolveAutoReply(
      clientReturning(null, {
        code: "PGRST205",
        message:
          "Could not find the table 'public.auto_reply_templates' in the schema cache",
      }),
      TENANT,
      KIND,
    );
    expect(resolved.enabled).toBe(true);
    expect(resolved.slots).toEqual(autoReplyDefaults(EVENT));
  });

  test("an unregistered kind has no copy to send", async () => {
    const resolved = await resolveAutoReply(
      clientReturning(null),
      TENANT,
      "no_such_reply",
    );
    expect(resolved.slots).toEqual(emptyAutoReplyCopy());
  });
});
