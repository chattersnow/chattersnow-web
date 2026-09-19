// Integration test: the automatic-replies Server Actions against a real local
// Supabase stack -- the action's own `system_settings:manage` check, and then
// `auto_reply_templates`'s RLS behind it (#1235, table from #1233).
//
// The two are deliberately tested together rather than the check alone: the
// action is what a browser can reach, and the policies are what stops a
// hand-made request. A test that only mocked the client would prove neither.
//
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SEEDED_USERS, signIn } from "../../../../../../test/integration-setup";
import {
  EVENT_REGISTRATION_CONFIRMATION_KIND,
  VOLUNTEER_APPLICATION_CONFIRMATION_KIND,
} from "@/lib/notifications/kinds";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

// admin.ts imports "server-only" -- stub it so this plain `bun test` run can
// import the real module. Needed because `auto_reply_templates` grants
// authenticated no delete at all (by design: resetting a reply is an empty
// `slots` object, which keeps the audit anchor), so the service-role client is
// the only way to leave the table as the fixture found it.
mock.module("server-only", () => ({}));
const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
const serviceRoleClient = createSupabaseAdminClient();

const { saveAutoReplyCopyAction, setAutoReplyEnabledAction } =
  await import("./actions");

const DENIED = { error: "You don't have permission to perform this action." };
const KIND = EVENT_REGISTRATION_CONFIRMATION_KIND;

const adminSession = await signIn(SEEDED_USERS.admin);
const volunteerSession = await signIn(SEEDED_USERS.volunteer);

async function row(kind = KIND) {
  const { data, error } = await serviceRoleClient
    .from("auto_reply_templates")
    .select("enabled, slots")
    .eq("kind", kind)
    .maybeSingle();
  if (error) throw error;
  return data;
}

afterEach(() => {
  revalidatePathMock.mockClear();
});

// The seed writes no rows for anybody (#1233), so the table is left empty
// rather than restored to some previous value.
afterAll(async () => {
  await serviceRoleClient
    .from("auto_reply_templates")
    .delete()
    .in("kind", [KIND, VOLUNTEER_APPLICATION_CONFIRMATION_KIND]);
});

describe("saveAutoReplyCopyAction", () => {
  test("an admin writes its tenant's copy, sparsely", async () => {
    currentSupabase = adminSession;

    const result = await saveAutoReplyCopyAction(KIND, {
      subject: "You're in — {{event_name}}",
    });

    expect(result).toEqual({ success: true });
    // Only the slot that was rewritten. The four absent keys are what keeps
    // this tenant tracking the platform's defaults as they improve.
    expect(await row()).toEqual({
      enabled: true,
      slots: { subject: "You're in — {{event_name}}" },
    });
    expect(revalidatePathMock).toHaveBeenCalled();
  });

  test("an empty object is the reset, and the row survives it", async () => {
    currentSupabase = adminSession;

    expect(await saveAutoReplyCopyAction(KIND, {})).toEqual({ success: true });
    // Not a deleted row: `enabled` still lives here, and so does the audit
    // trail's anchor. There is no delete policy to remove it with.
    expect(await row()).toEqual({ enabled: true, slots: {} });
  });

  test("a token the slot does not offer is refused, naming the field", async () => {
    currentSupabase = adminSession;
    const before = await row();

    const result = await saveAutoReplyCopyAction(KIND, {
      greeting: "Hi {{first_nmae}},",
    });

    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toContain("Greeting");
    expect((result as { error: string }).error).toContain("{{first_nmae}}");
    // Refused before the write, not after.
    expect(await row()).toEqual(before);
  });

  test("an unknown kind is refused", async () => {
    currentSupabase = adminSession;
    expect(await saveAutoReplyCopyAction("not_a_reply", {})).toEqual({
      error: "That automatic reply does not exist.",
    });
  });

  test("a volunteer is refused, and writes nothing", async () => {
    currentSupabase = volunteerSession;
    const before = await row();

    expect(
      await saveAutoReplyCopyAction(KIND, { subject: "Mine now" }),
    ).toEqual(DENIED);
    expect(await row()).toEqual(before);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  test("the RLS policies refuse the same write without the action", async () => {
    // The check in the action explains a refusal; this is what enforces it.
    const { error } = await volunteerSession
      .from("auto_reply_templates")
      .upsert(
        { kind: KIND, slots: { subject: "Mine now" } },
        { onConflict: "tenant_id,kind" },
      );
    expect(error).not.toBeNull();

    const { data } = await volunteerSession
      .from("auto_reply_templates")
      .select("kind");
    expect(data ?? []).toEqual([]);
  });
});

describe("setAutoReplyEnabledAction", () => {
  test("switches one reply off without touching its copy", async () => {
    currentSupabase = adminSession;
    await saveAutoReplyCopyAction(KIND, { closing: "See you on the hill." });

    expect(await setAutoReplyEnabledAction(KIND, false)).toEqual({
      success: true,
    });
    expect(await row()).toEqual({
      enabled: false,
      slots: { closing: "See you on the hill." },
    });

    // And back on, with the wording still theirs -- which is what the
    // confirmation dialog promises.
    expect(await setAutoReplyEnabledAction(KIND, true)).toEqual({
      success: true,
    });
    expect(await row()).toEqual({
      enabled: true,
      slots: { closing: "See you on the hill." },
    });
  });

  test("switching one reply off leaves the others alone", async () => {
    currentSupabase = adminSession;

    await setAutoReplyEnabledAction(
      VOLUNTEER_APPLICATION_CONFIRMATION_KIND,
      false,
    );

    expect((await row(VOLUNTEER_APPLICATION_CONFIRMATION_KIND))?.enabled).toBe(
      false,
    );
    expect((await row(KIND))?.enabled).toBe(true);
  });

  test("a volunteer is refused", async () => {
    currentSupabase = volunteerSession;
    expect(await setAutoReplyEnabledAction(KIND, false)).toEqual(DENIED);
    expect((await row())?.enabled).toBe(true);
  });
});
