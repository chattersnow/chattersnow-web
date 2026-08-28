// Integration test: exercises the real createResolutionAction against a
// real local Supabase stack (checkUser/checkPermission, direct
// `resolutions` insert under RLS). Requires
// `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterEach, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  anonClient,
  createPerson,
  signIn,
} from "../../../../../../test/integration-setup";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const { createResolutionAction } = await import("./resolutions-actions");

afterEach(() => {
  revalidatePathMock.mockClear();
});

function resolutionForm(overrides?: { motionText?: string }) {
  const fd = new FormData();
  fd.set(
    "motionText",
    overrides?.motionText ?? "Approve the winter fundraiser budget",
  );
  return fd;
}

async function latestResolution() {
  const { data, error } = await adminClient
    .from("resolutions")
    .select(
      "id, meeting_id, motion_text, vote_outcome, mover_person_id, seconder_person_id",
    )
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (error) throw error;
  return data;
}

async function cleanupResolution(id: string) {
  await adminClient.from("resolutions").delete().eq("id", id);
}

describe("createResolutionAction (integration)", () => {
  test("requires a signed-in user", async () => {
    currentSupabase = anonClient();
    const result = await createResolutionAction(
      null,
      crypto.randomUUID(),
      null,
      resolutionForm(),
    );
    expect(result).toEqual({
      error: "You must be signed in to add a resolution.",
    });
  });

  test("admin role (governance manage) can add a resolution with no meeting", async () => {
    const mover = await createPerson();
    currentSupabase = await signIn(SEEDED_USERS.admin);

    const result = await createResolutionAction(
      null,
      mover.id,
      null,
      resolutionForm(),
    );
    expect(result).toEqual({ success: true });
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/portal/governance/resolutions",
    );
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/portal/governance/meetings",
    );

    const row = await latestResolution();
    expect(row.meeting_id).toBeNull();
    expect(row.mover_person_id).toBe(mover.id);
    expect(row.vote_outcome).toBe("pending");
    expect(row.motion_text).toBe("Approve the winter fundraiser budget");

    await cleanupResolution(row.id as string);
    await mover.cleanup();
  });

  test("board role (governance manage) can also add a resolution", async () => {
    const mover = await createPerson();
    currentSupabase = await signIn(SEEDED_USERS.board);

    const result = await createResolutionAction(
      null,
      mover.id,
      null,
      resolutionForm(),
    );
    expect(result).toEqual({ success: true });

    const row = await latestResolution();
    await cleanupResolution(row.id as string);
    await mover.cleanup();
  });

  test("records the seconder when provided", async () => {
    const mover = await createPerson();
    const seconder = await createPerson();
    currentSupabase = await signIn(SEEDED_USERS.admin);

    const result = await createResolutionAction(
      null,
      mover.id,
      seconder.id,
      resolutionForm(),
    );
    expect(result).toEqual({ success: true });

    const row = await latestResolution();
    expect(row.seconder_person_id).toBe(seconder.id);

    await cleanupResolution(row.id as string);
    await mover.cleanup();
    await seconder.cleanup();
  });

  test("event_coordinator role cannot add a resolution", async () => {
    currentSupabase = await signIn(SEEDED_USERS.coordinator);
    const result = await createResolutionAction(
      null,
      crypto.randomUUID(),
      null,
      resolutionForm(),
    );
    expect(result).toEqual({
      error: "You don't have permission to perform this action.",
    });
  });

  test("finance role cannot add a resolution", async () => {
    currentSupabase = await signIn(SEEDED_USERS.finance);
    const result = await createResolutionAction(
      null,
      crypto.randomUUID(),
      null,
      resolutionForm(),
    );
    expect(result).toEqual({
      error: "You don't have permission to perform this action.",
    });
  });

  test("volunteer role cannot add a resolution", async () => {
    currentSupabase = await signIn(SEEDED_USERS.volunteer);
    const result = await createResolutionAction(
      null,
      crypto.randomUUID(),
      null,
      resolutionForm(),
    );
    expect(result).toEqual({
      error: "You don't have permission to perform this action.",
    });
  });

  test("a deactivated (former) account cannot add a resolution", async () => {
    currentSupabase = await signIn(SEEDED_USERS.former);
    const result = await createResolutionAction(
      null,
      crypto.randomUUID(),
      null,
      resolutionForm(),
    );
    expect(result).toEqual({
      error: "You don't have permission to perform this action.",
    });
  });

  test("requires a mover even for a permitted role", async () => {
    currentSupabase = await signIn(SEEDED_USERS.admin);
    const result = await createResolutionAction(
      null,
      "",
      null,
      resolutionForm(),
    );
    expect(result).toEqual({
      error: "Select or create a mover for this resolution.",
    });
  });
});
