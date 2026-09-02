// Integration test: exercises the real community-story consent Server Action
// against a real local Supabase stack (checkPermission, then real
// `content_permissions` RLS -- same content_calendar resource as
// content_opportunities: admin/event_coordinator manage,
// finance/board/volunteer view). Requires `bun run db:start && bun run
// db:reset` first; run via `bun run test:integration`. Not picked up by
// `bun run test`.
import { afterEach, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  anonClient,
  createCalendarItem,
  createContentOpportunity,
  signInAs,
} from "../../../../../test/integration-setup";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const { upsertContentPermissionAction } =
  await import("./content-permission-actions");

afterEach(() => {
  revalidatePathMock.mockClear();
});

function consentForm(overrides: { permittedUse?: string } = {}) {
  const fd = new FormData();
  fd.set(
    "permittedUse",
    overrides.permittedUse ?? "Website spotlight and newsletter",
  );
  fd.set("consentOnFileAt", "2026-08-01");
  return fd;
}

const DENIED = { error: "You don't have permission to perform this action." };

describe("content permission (consent) actions (integration)", () => {
  test("requires a signed-in user to record consent", async () => {
    currentSupabase = anonClient();
    expect(
      await upsertContentPermissionAction(crypto.randomUUID(), consentForm()),
    ).toEqual({ error: "You must be signed in to record consent." });
  });

  test("admin role (content_calendar manage) can insert then update consent", async () => {
    const item = await createCalendarItem();
    const opportunity = await createContentOpportunity(item.id);
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(
      await upsertContentPermissionAction(opportunity.id, consentForm()),
    ).toEqual({ success: true });

    const { data: inserted } = await adminClient
      .from("content_permissions")
      .select("id, permitted_use, recorded_by")
      .eq("content_opportunity_id", opportunity.id)
      .single();
    expect(inserted?.permitted_use).toBe("Website spotlight and newsletter");
    expect(inserted?.recorded_by).not.toBeNull();

    expect(
      await upsertContentPermissionAction(
        opportunity.id,
        consentForm({ permittedUse: "Newsletter only" }),
      ),
    ).toEqual({ success: true });

    const { data: updated } = await adminClient
      .from("content_permissions")
      .select("id, permitted_use")
      .eq("content_opportunity_id", opportunity.id)
      .single();
    // Update-in-place, not a second row: same id, new permitted_use.
    expect(updated?.id).toBe(inserted!.id);
    expect(updated?.permitted_use).toBe("Newsletter only");

    await item.cleanup();
  });

  test("event_coordinator role (content_calendar manage) can record consent", async () => {
    const item = await createCalendarItem();
    const opportunity = await createContentOpportunity(item.id);
    currentSupabase = await signInAs(SEEDED_USERS.coordinator);

    expect(
      await upsertContentPermissionAction(opportunity.id, consentForm()),
    ).toEqual({ success: true });

    await item.cleanup();
  });

  test("finance role (content_calendar view only) cannot record consent", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.finance);
    expect(
      await upsertContentPermissionAction(crypto.randomUUID(), consentForm()),
    ).toEqual(DENIED);
  });

  test("board role (content_calendar view only) cannot record consent", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.board);
    expect(
      await upsertContentPermissionAction(crypto.randomUUID(), consentForm()),
    ).toEqual(DENIED);
  });

  test("volunteer role (content_calendar view only) cannot record consent", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.volunteer);
    expect(
      await upsertContentPermissionAction(crypto.randomUUID(), consentForm()),
    ).toEqual(DENIED);
  });

  test("a deactivated (former) account cannot record consent", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.former);
    expect(
      await upsertContentPermissionAction(crypto.randomUUID(), consentForm()),
    ).toEqual(DENIED);
  });
});
