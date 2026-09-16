// Integration test: exercises the real updateContactMessageStatusAction
// (checkUser/checkPermission, then the real `contact_messages` RLS) plus the
// table's RLS policies themselves against a real local Supabase stack. No
// integration test previously touched `contact_messages` at all, even though
// it holds public contact-form PII (name/email/message) and is the only
// table gated on the `communications` resource. Requires
// `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterEach, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  anonClient,
  signIn,
  uniqueEmail,
  uniqueIp,
} from "../../../../../test/integration-setup";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

// admin.ts imports "server-only", which throws outside Next's bundler --
// stub it so this plain `bun test` run can import the real module. Needed
// here because contact_messages carries only select and update policies
// (rows arrive via the security-definer submit_contact_message RPC), so no
// signed-in client -- admin included -- can delete its own fixtures.
mock.module("server-only", () => ({}));
const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
const serviceRoleClient = createSupabaseAdminClient();

const { updateContactMessageStatusAction, sendContactMessageReplyAction } =
  await import("./actions");
const { CONTACT_MESSAGE_RECORD_TYPE } = await import("@/lib/outbound-messages");

afterEach(async () => {
  revalidatePathMock.mockClear();
  // Only the service role may clear these: outbound_messages has no delete
  // policy at all, and notification_deliveries none for `authenticated`.
  await serviceRoleClient
    .from("outbound_messages")
    .delete()
    .eq("record_type", "contact_message");
  await serviceRoleClient
    .from("notification_deliveries")
    .delete()
    .eq("kind", "staff_message");
});

const DENIED = { error: "You don't have permission to perform this action." };

// role_permissions seeds `communications` to admin only
// (20260826220000_add_status_and_communications_permission_to_contact_messages.sql),
// so every other seeded account -- including the multi-role and deactivated
// ones -- must be denied both view and manage.
const ROLES_WITHOUT_COMMUNICATIONS = [
  ["event_coordinator", SEEDED_USERS.coordinator],
  ["finance", SEEDED_USERS.finance],
  ["board", SEEDED_USERS.board],
  ["volunteer", SEEDED_USERS.volunteer],
  ["multi-role (event_coordinator + volunteer)", SEEDED_USERS.multi],
  ["no-role", SEEDED_USERS.noAccess],
  ["deactivated (former)", SEEDED_USERS.former],
] as const;

let adminUserIdCache: string | undefined;
async function adminUserId(): Promise<string> {
  if (adminUserIdCache) return adminUserIdCache;
  // One page big enough to hold the whole stack. `listUsers()` has no
  // by-email filter and defaults to 50, so on a local database that has run a
  // few suites -- or in one CI run where another file created accounts -- the
  // seeded users fall off page one and this throws "seeded user ... not found"
  // in a file that created no users at all. `demo-actions.ts` and the
  // administration users suite already page for the same reason.
  const { data, error } = await serviceRoleClient.auth.admin.listUsers({
    perPage: 1000,
  });
  if (error) throw error;
  const user = data.users.find((u) => u.email === SEEDED_USERS.admin);
  if (!user) throw new Error(`seeded user ${SEEDED_USERS.admin} not found`);
  adminUserIdCache = user.id;
  return user.id;
}

// Creates a message the same way a real visitor does -- through the
// security-definer submit_contact_message RPC as anon -- rather than by
// inserting directly, since nothing else can write this table. Each call
// gets a fresh IP because the RPC rate-limits to 5 per (route, ip) per 15
// minutes.
async function createContactMessage() {
  const email = uniqueEmail("contact");
  const { data, error } = await anonClient().rpc("submit_contact_message", {
    p_name: "Integration Test Sender",
    p_email: email,
    p_topic: "general",
    p_message: "Integration test contact message",
    p_honeypot: null,
    p_ip_address: uniqueIp(),
  });
  if (error) throw error;

  const id = data as string;
  return {
    id,
    email,
    async cleanup() {
      await serviceRoleClient.from("contact_messages").delete().eq("id", id);
    },
  };
}

async function readMessage(id: string) {
  const { data, error } = await serviceRoleClient
    .from("contact_messages")
    .select("id, status, updated_by")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as { id: string; status: string; updated_by: string | null };
}

describe("updateContactMessageStatusAction (integration)", () => {
  test("requires a signed-in user", async () => {
    currentSupabase = anonClient();
    const result = await updateContactMessageStatusAction(
      crypto.randomUUID(),
      "read",
    );
    expect(result).toEqual({
      error: "You must be signed in to update a message.",
    });
  });

  test("admin role (communications:manage) can mark a message read", async () => {
    const message = await createContactMessage();
    currentSupabase = await signIn(SEEDED_USERS.admin);

    const result = await updateContactMessageStatusAction(message.id, "read");
    expect(result).toEqual({ success: true });
    expect(revalidatePathMock).toHaveBeenCalledWith("/portal/communications");

    const row = await readMessage(message.id);
    expect(row.status).toBe("read");
    // The set_updated_at trigger stamps auth.uid(), so a successful update
    // also proves the write ran as the signed-in admin rather than as a
    // privileged bypass.
    expect(row.updated_by).toBe(await adminUserId());

    await message.cleanup();
  });

  test("admin role can move a message on to resolved", async () => {
    const message = await createContactMessage();
    currentSupabase = await signIn(SEEDED_USERS.admin);

    const result = await updateContactMessageStatusAction(
      message.id,
      "resolved",
    );
    expect(result).toEqual({ success: true });
    expect((await readMessage(message.id)).status).toBe("resolved");

    await message.cleanup();
  });

  test("admin role cannot set a status outside the allowed set", async () => {
    const message = await createContactMessage();
    currentSupabase = await signIn(SEEDED_USERS.admin);

    const result = await updateContactMessageStatusAction(
      message.id,
      // @ts-expect-error testing an invalid value
      "archived",
    );
    expect(result).toEqual({ error: "Not a valid status." });
    expect((await readMessage(message.id)).status).toBe("new");

    await message.cleanup();
  });

  for (const [label, email] of ROLES_WITHOUT_COMMUNICATIONS) {
    test(`${label} account cannot update a message status`, async () => {
      const message = await createContactMessage();
      currentSupabase = await signIn(email);

      const result = await updateContactMessageStatusAction(message.id, "read");
      expect(result).toEqual(DENIED);
      expect(revalidatePathMock).not.toHaveBeenCalled();
      expect((await readMessage(message.id)).status).toBe("new");

      await message.cleanup();
    });
  }
});

// The portal page and the ops-inbox counter read `contact_messages`
// directly rather than through a Server Action, so the select policy needs
// its own coverage; the insert/delete cases pin down that the table has no
// authenticated write path at all beyond the status update above.
describe("contact_messages table RLS (integration)", () => {
  test("admin role (communications:view) can read a submission's PII", async () => {
    const message = await createContactMessage();

    const { data, error } = await adminClient
      .from("contact_messages")
      .select("id, name, email, topic, message, status")
      .eq("id", message.id)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.email).toBe(message.email);
    expect(data?.message).toBe("Integration test contact message");

    await message.cleanup();
  });

  for (const [label, email] of ROLES_WITHOUT_COMMUNICATIONS) {
    test(`${label} account cannot read any submission`, async () => {
      const message = await createContactMessage();
      const client = await signIn(email);

      // RLS filters rows rather than erroring, so an unauthorized read looks
      // like an empty table -- assert on both the targeted row and the
      // unfiltered list so a leak anywhere in the table fails the test.
      const { data: row, error: rowError } = await client
        .from("contact_messages")
        .select("id, email, message")
        .eq("id", message.id)
        .maybeSingle();
      expect(rowError).toBeNull();
      expect(row).toBeNull();

      const { data: all, error: allError } = await client
        .from("contact_messages")
        .select("id");
      expect(allError).toBeNull();
      expect(all).toEqual([]);

      await message.cleanup();
    });
  }

  test("anonymous visitors can submit but cannot read the table back", async () => {
    const message = await createContactMessage();
    const anon = anonClient();

    // Anon holds no table grant at all (20260826180000 grants select only to
    // authenticated), so the read is refused at the privilege layer (42501)
    // rather than filtering to an empty result.
    const { data, error } = await anon.from("contact_messages").select("id");
    expect(error?.code).toBe("42501");
    expect(data).toBeNull();

    // The submission itself still landed -- anon's only write path is the
    // security-definer RPC, not table access.
    expect((await readMessage(message.id)).status).toBe("new");

    await message.cleanup();
  });

  test("a role without communications:manage cannot update a message directly", async () => {
    const message = await createContactMessage();
    const client = await signIn(SEEDED_USERS.finance);

    await client
      .from("contact_messages")
      .update({ status: "resolved" })
      .eq("id", message.id);

    expect((await readMessage(message.id)).status).toBe("new");

    await message.cleanup();
  });

  test("even admin cannot insert a message directly (no insert policy)", async () => {
    const { error } = await adminClient.from("contact_messages").insert({
      name: "Direct insert",
      email: uniqueEmail("direct"),
      topic: "general",
      message: "Should never land",
    });
    expect(error).not.toBeNull();

    const { data } = await serviceRoleClient
      .from("contact_messages")
      .select("id")
      .eq("name", "Direct insert");
    expect(data).toEqual([]);
  });

  test("even admin cannot delete a message directly (no delete grant)", async () => {
    const message = await createContactMessage();

    // Authenticated has no delete grant on the table (20260826180000 grants
    // select, 20260826220000 adds update), so the delete is refused at the
    // privilege layer (42501) rather than silently matching no rows.
    const { error } = await adminClient
      .from("contact_messages")
      .delete()
      .eq("id", message.id);
    expect(error?.code).toBe("42501");

    // Still there: submissions are retained until a purge path exists.
    expect((await readMessage(message.id)).id).toBe(message.id);

    await message.cleanup();
  });
});

// #1204: replying from the portal. This is the one adopting queue whose
// recipient has no `people` row -- `contact_messages` carries an address and
// nothing else -- so it is the case `outbound_messages.person_id` was made
// nullable for, and the only place that nullability is exercised end to end.
function reply(
  contactMessageId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    messageId: crypto.randomUUID(),
    contactMessageId,
    subject: "Re: General enquiry",
    body: "Thanks for writing in — we meet on Tuesdays.",
    ...overrides,
  };
}

describe("sendContactMessageReplyAction (integration)", () => {
  test("requires a signed-in user", async () => {
    currentSupabase = anonClient();
    expect(
      await sendContactMessageReplyAction(reply(crypto.randomUUID())),
    ).toEqual({ error: "You must be signed in to reply to a message." });
  });

  test.each(ROLES_WITHOUT_COMMUNICATIONS)(
    "refuses %s",
    async (_label, email) => {
      currentSupabase = await signIn(email);
      expect(
        await sendContactMessageReplyAction(reply(crypto.randomUUID())),
      ).toEqual(DENIED);
    },
  );

  test("a communications manager replies, and the reply carries no person", async () => {
    const message = await createContactMessage();
    currentSupabase = await signIn(SEEDED_USERS.admin);

    const input = reply(message.id);
    expect(await sendContactMessageReplyAction(input)).toEqual({
      success: true,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/portal/communications");

    const { data } = await serviceRoleClient
      .from("outbound_messages")
      .select("id, module, record_type, record_id, person_id, to_email, status")
      .eq("record_id", message.id)
      .single();
    expect(data).toMatchObject({
      id: input.messageId,
      module: "communications",
      record_type: CONTACT_MESSAGE_RECORD_TYPE,
      to_email: message.email,
      status: "sent",
    });
    // Nobody who wrote in once becomes a person in the directory.
    expect(data!.person_id).toBeNull();
    const { data: people } = await serviceRoleClient
      .from("people")
      .select("id")
      .eq("email", message.email);
    expect(people).toEqual([]);

    await message.cleanup();
  });

  test("replying leaves the message's status alone", async () => {
    const message = await createContactMessage();
    currentSupabase = await signIn(SEEDED_USERS.admin);

    expect(await sendContactMessageReplyAction(reply(message.id))).toEqual({
      success: true,
    });

    // A reply that asks a question is not the matter being handled, so the
    // queue keeps saying what it said.
    expect((await readMessage(message.id)).status).toBe("new");

    await message.cleanup();
  });

  test("says what is wrong instead of sending nothing quietly", async () => {
    const message = await createContactMessage();
    currentSupabase = await signIn(SEEDED_USERS.admin);

    expect(
      await sendContactMessageReplyAction(reply(message.id, { body: "\n" })),
    ).toEqual({ error: "Write a message." });
    expect(
      await sendContactMessageReplyAction(
        reply(message.id, { messageId: "not-a-uuid" }),
      ),
    ).toEqual({ error: "Reopen the message and try again." });
    expect(
      await sendContactMessageReplyAction(reply(crypto.randomUUID())),
    ).toEqual({ error: "This message could not be found." });

    const { data } = await serviceRoleClient
      .from("outbound_messages")
      .select("id")
      .eq("record_type", CONTACT_MESSAGE_RECORD_TYPE);
    expect(data).toEqual([]);

    await message.cleanup();
  });

  test("one composition sends one email, whatever the client does", async () => {
    const message = await createContactMessage();
    currentSupabase = await signIn(SEEDED_USERS.admin);
    const input = reply(message.id);

    expect(await sendContactMessageReplyAction(input)).toEqual({
      success: true,
    });
    expect(await sendContactMessageReplyAction(input)).toEqual({
      error:
        "That message has already gone out. Reopen the composer to send another.",
    });

    const { count } = await serviceRoleClient
      .from("outbound_messages")
      .select("id", { count: "exact", head: true })
      .eq("record_id", message.id);
    expect(count).toBe(1);

    await message.cleanup();
  });
});
