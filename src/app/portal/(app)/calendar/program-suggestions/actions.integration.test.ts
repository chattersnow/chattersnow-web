// Integration test: exercises the real program-suggestion-rule Server
// Actions against a real local Supabase stack (checkPermission, then real
// `calendar_program_suggestion_rules` RLS -- content_calendar:
// admin/event_coordinator manage, finance/board/volunteer view). Each test
// creates its own program so rules never collide with seeded ones on the
// unique (item_type, category, program_id) index. Requires `bun run
// db:start && bun run db:reset` first; run via `bun run test:integration`.
// Not picked up by `bun run test`.
import { afterEach, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  anonClient,
  createProgram,
  signInAs,
} from "../../../../../../test/integration-setup";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const {
  createSuggestionRuleAction,
  updateSuggestionRuleAction,
  deleteSuggestionRuleAction,
  listActiveProgramSuggestionRulesAction,
} = await import("./actions");

afterEach(() => {
  revalidatePathMock.mockClear();
});

function ruleForm(programId: string, overrides: { note?: string } = {}) {
  const fd = new FormData();
  fd.set("itemType", "any");
  fd.set("category", "winter_outdoor_sports");
  fd.set("programId", programId);
  fd.set("note", overrides.note ?? "Integration test rule");
  fd.set("isActive", "true");
  return fd;
}

const DENIED = { error: "You don't have permission to perform this action." };

describe("program suggestion rule actions (integration)", () => {
  test("requires a signed-in user to create a rule", async () => {
    currentSupabase = anonClient();
    expect(
      await createSuggestionRuleAction(ruleForm(crypto.randomUUID())),
    ).toEqual({ error: "You must be signed in to create a suggestion rule." });
  });

  test("admin role (content_calendar manage) can create, update, and delete a rule", async () => {
    const program = await createProgram();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(await createSuggestionRuleAction(ruleForm(program.id))).toEqual({
      success: true,
    });

    const { data: rule } = await adminClient
      .from("calendar_program_suggestion_rules")
      .select("id")
      .eq("program_id", program.id)
      .single();

    expect(
      await updateSuggestionRuleAction(
        rule!.id,
        ruleForm(program.id, { note: "Updated in integration test" }),
      ),
    ).toEqual({ success: true });
    const { data: updated } = await adminClient
      .from("calendar_program_suggestion_rules")
      .select("note")
      .eq("id", rule!.id)
      .single();
    expect(updated?.note).toBe("Updated in integration test");

    expect(await deleteSuggestionRuleAction(rule!.id)).toEqual({
      success: true,
    });
    const { data: afterDelete } = await adminClient
      .from("calendar_program_suggestion_rules")
      .select("id")
      .eq("id", rule!.id);
    expect(afterDelete).toHaveLength(0);

    await program.cleanup();
  });

  test("event_coordinator role (content_calendar manage) can create a rule", async () => {
    const program = await createProgram();
    currentSupabase = await signInAs(SEEDED_USERS.coordinator);

    expect(await createSuggestionRuleAction(ruleForm(program.id))).toEqual({
      success: true,
    });

    // Rules reference programs with on delete cascade.
    await program.cleanup();
  });

  test("finance role (content_calendar view only) can list active rules but not write", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.finance);

    expect("data" in (await listActiveProgramSuggestionRulesAction())).toBe(
      true,
    );
    expect(
      await createSuggestionRuleAction(ruleForm(crypto.randomUUID())),
    ).toEqual(DENIED);
    expect(
      await updateSuggestionRuleAction(
        crypto.randomUUID(),
        ruleForm(crypto.randomUUID()),
      ),
    ).toEqual(DENIED);
    expect(await deleteSuggestionRuleAction(crypto.randomUUID())).toEqual(
      DENIED,
    );
  });

  test("board role (content_calendar view only) can list active rules but not write", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.board);

    expect("data" in (await listActiveProgramSuggestionRulesAction())).toBe(
      true,
    );
    expect(
      await createSuggestionRuleAction(ruleForm(crypto.randomUUID())),
    ).toEqual(DENIED);
  });

  test("volunteer role (content_calendar view only) can list active rules but not write", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.volunteer);

    expect("data" in (await listActiveProgramSuggestionRulesAction())).toBe(
      true,
    );
    expect(
      await createSuggestionRuleAction(ruleForm(crypto.randomUUID())),
    ).toEqual(DENIED);
  });

  test("a no-role account can neither list nor create rules", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.noAccess);

    expect(await listActiveProgramSuggestionRulesAction()).toEqual(DENIED);
    expect(
      await createSuggestionRuleAction(ruleForm(crypto.randomUUID())),
    ).toEqual(DENIED);
  });

  test("a deactivated (former) account cannot create a rule", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.former);
    expect(
      await createSuggestionRuleAction(ruleForm(crypto.randomUUID())),
    ).toEqual(DENIED);
  });
});
