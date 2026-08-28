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
// here because `authenticated` is granted only select+update on
// contact_messages (rows arrive via the security-definer
// submit_contact_message RPC), so no signed-in client -- admin included --
// can delete its own fixtures.
mock.module("server-only", () => ({}));
const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
const serviceRoleClient = createSupabaseAdminClient();

const { updateContactMessageStatusAction } = await import("./actions");

afterEach(() => {
  revalidatePathMock.mockClear();
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
  const { data, error } = await serviceRoleClient.auth.admin.listUsers();
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

    const { data, error } = await anon.from("contact_messages").select("id");
    expect(error).not.toBeNull();
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

  test("even admin cannot insert a message directly (no grant to authenticated)", async () => {
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

  test("even admin cannot delete a message directly (no grant to authenticated)", async () => {
    const message = await createContactMessage();

    const { error } = await adminClient
      .from("contact_messages")
      .delete()
      .eq("id", message.id);
    expect(error).not.toBeNull();

    // Still there: submissions are retained until a purge path exists.
    expect((await readMessage(message.id)).id).toBe(message.id);

    await message.cleanup();
  });
});
