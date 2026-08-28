// Integration test: exercises the real content-opportunity (brief) Server
// Actions against a real local Supabase stack (checkPermission, then real
// `content_opportunities` RLS -- same content_calendar resource as
// calendar_items: admin/event_coordinator manage, finance/board/volunteer
// view). Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterEach, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  anonClient,
  createCalendarItem,
  signInAs,
} from "../../../../../test/integration-setup";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const { createContentOpportunityAction, updateContentOpportunityAction } =
  await import("./content-opportunity-actions");

afterEach(() => {
  revalidatePathMock.mockClear();
});

function opportunityForm(overrides: { internalNotes?: string } = {}) {
  const fd = new FormData();
  fd.set("contentStatus", "idea");
  fd.set("leadTimeDays", "21");
  if (overrides.internalNotes) fd.set("internalNotes", overrides.internalNotes);
  return fd;
}

const DENIED = { error: "You don't have permission to perform this action." };

describe("content opportunity actions (integration)", () => {
  test("requires a signed-in user to start a content brief", async () => {
    currentSupabase = anonClient();
    expect(
      await createContentOpportunityAction(
        crypto.randomUUID(),
        opportunityForm(),
      ),
    ).toEqual({ error: "You must be signed in to start a content brief." });
  });

  test("admin role (content_calendar manage) can create and update a brief", async () => {
    const item = await createCalendarItem();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(
      await createContentOpportunityAction(item.id, opportunityForm()),
    ).toEqual({ success: true });

    const { data: created } = await adminClient
      .from("content_opportunities")
      .select("id, content_status")
      .eq("calendar_item_id", item.id)
      .single();
    expect(created?.content_status).toBe("idea");

    expect(
      await updateContentOpportunityAction(
        created!.id,
        opportunityForm({ internalNotes: "Updated in integration test" }),
      ),
    ).toEqual({ success: true });

    const { data: updated } = await adminClient
      .from("content_opportunities")
      .select("internal_notes")
      .eq("id", created!.id)
      .single();
    expect(updated?.internal_notes).toBe("Updated in integration test");

    await item.cleanup();
  });

  test("event_coordinator role (content_calendar manage) can create a brief", async () => {
    const item = await createCalendarItem();
    currentSupabase = await signInAs(SEEDED_USERS.coordinator);

    expect(
      await createContentOpportunityAction(item.id, opportunityForm()),
    ).toEqual({ success: true });

    await item.cleanup();
  });

  test("finance role (content_calendar view only) cannot create or update a brief", async () => {
    const item = await createCalendarItem();
    currentSupabase = await signInAs(SEEDED_USERS.finance);

    expect(
      await createContentOpportunityAction(item.id, opportunityForm()),
    ).toEqual(DENIED);
    expect(
      await updateContentOpportunityAction(
        crypto.randomUUID(),
        opportunityForm(),
      ),
    ).toEqual(DENIED);

    await item.cleanup();
  });

  test("board role (content_calendar view only) cannot create a brief", async () => {
    const item = await createCalendarItem();
    currentSupabase = await signInAs(SEEDED_USERS.board);

    expect(
      await createContentOpportunityAction(item.id, opportunityForm()),
    ).toEqual(DENIED);

    await item.cleanup();
  });

  test("volunteer role (content_calendar view only) cannot create a brief", async () => {
    const item = await createCalendarItem();
    currentSupabase = await signInAs(SEEDED_USERS.volunteer);

    expect(
      await createContentOpportunityAction(item.id, opportunityForm()),
    ).toEqual(DENIED);

    await item.cleanup();
  });

  test("a deactivated (former) account cannot create a brief", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.former);
    expect(
      await createContentOpportunityAction(
        crypto.randomUUID(),
        opportunityForm(),
      ),
    ).toEqual(DENIED);
  });
});
