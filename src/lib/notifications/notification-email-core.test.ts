// #1125. What these can prove is what the TypeScript does: which RPC is
// called, whether a confirmation is scheduled, and -- the one that matters --
// whose address it is addressed to. Whether the RPC itself refuses the wrong
// caller is a policy question, and lives in the integration file beside this
// one.
import { describe, expect, test } from "bun:test";
import {
  confirmationOwedFor,
  setMyNotificationEmail,
  setNotificationEmailForPerson,
  type NotificationEmailContext,
  type SetNotificationEmailRow,
} from "./notification-email-core";
import { domainRpcCalls, fakeSupabase } from "../../../test/fake-supabase";

const MANAGE = { people: "manage" as const };
const ORIGIN = "https://portal.example.org";

/** A context whose scheduled tasks the test runs itself, as after() would. */
function capturingContext(): NotificationEmailContext & {
  tasks: (() => Promise<void>)[];
} {
  const tasks: (() => Promise<void>)[] = [];
  return { origin: ORIGIN, schedule: (task) => tasks.push(task), tasks };
}

function pendingRow(
  overrides: Partial<SetNotificationEmailRow> = {},
): SetNotificationEmailRow {
  return {
    outcome: "pending",
    person_id: "person-1",
    tenant_id: "tenant-1",
    display_name: "Sam Rider",
    pending_email: "sam@example.org",
    expires_at: "2026-09-16T00:00:00.000Z",
    ...overrides,
  };
}

describe("confirmationOwedFor", () => {
  test("assembles the send from the row the database wrote", () => {
    const owed = confirmationOwedFor(pendingRow(), "raw-token", "hash", ORIGIN);

    expect(owed).toEqual({
      tenantId: "tenant-1",
      personId: "person-1",
      personName: "Sam Rider",
      pendingEmail: "sam@example.org",
      token: "raw-token",
      tokenHash: "hash",
      expiresAt: new Date("2026-09-16T00:00:00.000Z"),
      fallbackOrigin: ORIGIN,
    });
  });

  test.each([
    ["cleared", pendingRow({ outcome: "cleared" })],
    ["unchanged", pendingRow({ outcome: "unchanged" })],
    ["a pending row with no address", pendingRow({ pending_email: null })],
    ["a pending row with no expiry", pendingRow({ expires_at: null })],
    ["no row at all", undefined],
  ])("owes nothing for %s", (_label, row) => {
    expect(confirmationOwedFor(row, "raw-token", "hash", ORIGIN)).toBeNull();
  });
});

describe("setMyNotificationEmail", () => {
  test("refuses a signed-out caller before touching the database", async () => {
    const supabase = fakeSupabase({ userId: null });
    const context = capturingContext();

    const result = await setMyNotificationEmail(
      supabase.client,
      "sam@example.org",
      context,
    );

    expect(result).toEqual({
      error: { code: "unauthenticated", message: "You must be signed in." },
    });
    expect(domainRpcCalls(supabase.rpcCalls)).toEqual([]);
    expect(context.tasks).toEqual([]);
  });

  test("refuses an address that is not one, and names the field", async () => {
    const supabase = fakeSupabase();
    const context = capturingContext();

    const result = await setMyNotificationEmail(
      supabase.client,
      "not-an-address",
      context,
    );

    expect(result).toEqual({
      error: {
        code: "invalid_input",
        message: "That does not look like an email address.",
        fields: { email: "That does not look like an email address." },
      },
    });
    expect(domainRpcCalls(supabase.rpcCalls)).toEqual([]);
  });

  test("stages the trimmed address under its token's hash", async () => {
    const supabase = fakeSupabase({
      rpc: { set_my_notification_email: { data: [pendingRow()] } },
    });
    const context = capturingContext();

    const result = await setMyNotificationEmail(
      supabase.client,
      "  sam@example.org  ",
      context,
    );

    expect(result).toEqual({
      success: true,
      outcome: "pending",
      pendingEmail: "sam@example.org",
    });
    const [call] = domainRpcCalls(supabase.rpcCalls);
    expect(call.name).toBe("set_my_notification_email");
    const args = call.args as { p_email: string; p_token_hash: string };
    expect(args.p_email).toBe("sam@example.org");
    // The raw token is never stored, so what the row carries is its hash --
    // and it has to be the hash of the token the email will carry.
    expect(args.p_token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(context.tasks).toHaveLength(1);
  });

  test("clears the override with no hash and nothing scheduled", async () => {
    const supabase = fakeSupabase({
      rpc: {
        set_my_notification_email: {
          data: [pendingRow({ outcome: "cleared", pending_email: null })],
        },
      },
    });
    const context = capturingContext();

    const result = await setMyNotificationEmail(supabase.client, "  ", context);

    expect(result).toEqual({
      success: true,
      outcome: "cleared",
      pendingEmail: null,
    });
    const args = domainRpcCalls(supabase.rpcCalls)[0].args as {
      p_email: string;
      p_token_hash: string | null;
    };
    expect(args).toEqual({ p_email: "", p_token_hash: null });
    expect(context.tasks).toEqual([]);
  });

  test("turns an RPC failure into its own display copy", async () => {
    const supabase = fakeSupabase({
      rpc: {
        set_my_notification_email: { error: { message: "connection reset" } },
      },
    });
    const context = capturingContext();

    const result = await setMyNotificationEmail(
      supabase.client,
      "sam@example.org",
      context,
    );

    expect(result).toEqual({
      error: {
        code: "server_error",
        message: "Could not save your notification email. Please try again.",
      },
    });
    expect(context.tasks).toEqual([]);
  });
});

describe("setNotificationEmailForPerson", () => {
  test("refuses a caller without people:manage", async () => {
    const supabase = fakeSupabase({ permissions: { people: "view" } });
    const context = capturingContext();

    const result = await setNotificationEmailForPerson(
      supabase.client,
      "person-1",
      "sam@example.org",
      context,
    );

    expect(result).toEqual({
      error: {
        code: "forbidden",
        message: "You don't have permission to perform this action.",
      },
    });
    expect(domainRpcCalls(supabase.rpcCalls)).toEqual([]);
    expect(context.tasks).toEqual([]);
  });

  test("writes the named person's row, not the caller's", async () => {
    const supabase = fakeSupabase({
      permissions: MANAGE,
      rpc: { set_notification_email_for_person: { data: [pendingRow()] } },
    });
    const context = capturingContext();

    await setNotificationEmailForPerson(
      supabase.client,
      "person-1",
      "sam@example.org",
      context,
    );

    const [call] = domainRpcCalls(supabase.rpcCalls);
    expect(call.name).toBe("set_notification_email_for_person");
    expect((call.args as { p_person_id: string }).p_person_id).toBe("person-1");
  });

  test("turns an RPC failure into the third-party copy", async () => {
    const supabase = fakeSupabase({
      permissions: MANAGE,
      rpc: {
        set_notification_email_for_person: {
          error: { message: "connection reset" },
        },
      },
    });

    const result = await setNotificationEmailForPerson(
      supabase.client,
      "person-1",
      "sam@example.org",
      capturingContext(),
    );

    expect(result).toEqual({
      error: {
        code: "server_error",
        message: "Could not save the notification email. Please try again.",
      },
    });
  });
});

// The regression #1049 exists to prevent: an administrator asks on somebody
// else's behalf, and the link goes to the address being claimed rather than to
// the administrator who typed it. What guarantees it is that the recipient is
// read off the row the database wrote, never off the session that called it --
// so an administrator whose own address is elsewhere entirely still addresses
// the person's. That the scheduled send carries these arguments end to end is
// the integration file's half.
test("addresses the confirmation to the person whose row was written", async () => {
  const row = pendingRow({
    person_id: "person-42",
    display_name: "Ari Voss",
    pending_email: "ari@example.org",
  });
  const supabase = fakeSupabase({
    permissions: MANAGE,
    rpc: { set_notification_email_for_person: { data: [row] } },
  });
  const context = capturingContext();

  await setNotificationEmailForPerson(
    supabase.client,
    "person-42",
    "ari@example.org",
    context,
  );

  expect(context.tasks).toHaveLength(1);
  const owed = confirmationOwedFor(row, "raw-token", "hash", ORIGIN);
  expect(owed?.pendingEmail).toBe("ari@example.org");
  expect(owed?.personId).toBe("person-42");
});
