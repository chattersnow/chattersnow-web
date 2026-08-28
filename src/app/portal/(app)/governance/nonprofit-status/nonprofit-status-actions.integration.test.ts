// Integration test: exercises the real nonprofit status milestone Server
// Actions against a real local Supabase stack (checkUser/checkPermission,
// then real `nonprofit_status_milestones` RLS). Covers the status-only
// action too, which takes its own guard path. Requires
// `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterEach, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  anonClient,
  createPerson,
  signInAs,
} from "../../../../../../test/integration-setup";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const {
  createMilestoneAction,
  updateMilestoneAction,
  updateMilestoneStatusAction,
} = await import("./nonprofit-status-actions");

afterEach(() => {
  revalidatePathMock.mockClear();
});

const DENIED = { error: "You don't have permission to perform this action." };

// `nonprofit_status_milestones` is seeded with the real 501(c)(3) roadmap and
// has no natural unique key, so each test tags its row with a random
// description and looks that up rather than reading "the most recent row".
function milestoneForm(
  description: string,
  overrides: { status?: string; phase?: string } = {},
) {
  const fd = new FormData();
  fd.set("description", description);
  fd.set("phase", overrides.phase ?? "federal");
  fd.set("status", overrides.status ?? "not_started");
  fd.set("dueDate", "2026-09-30");
  return fd;
}

function uniqueDescription() {
  return `IT Milestone ${crypto.randomUUID()}`;
}

async function milestoneFor(description: string) {
  const { data, error } = await adminClient
    .from("nonprofit_status_milestones")
    .select("id, description, phase, status, due_date, owner_person_id")
    .eq("description", description)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function seedMilestone(description: string, ownerPersonId: string) {
  currentSupabase = await signInAs(SEEDED_USERS.admin);
  const result = await createMilestoneAction(
    ownerPersonId,
    milestoneForm(description),
  );
  if ("error" in result) throw new Error(result.error);
  const row = await milestoneFor(description);
  if (!row) throw new Error("expected a seeded milestone");
  return row.id as string;
}

async function cleanupMilestone(description: string) {
  await adminClient
    .from("nonprofit_status_milestones")
    .delete()
    .eq("description", description);
}

describe("nonprofit status milestone actions (integration)", () => {
  test("requires a signed-in user", async () => {
    currentSupabase = anonClient();

    expect(
      await createMilestoneAction(null, milestoneForm(uniqueDescription())),
    ).toEqual({ error: "You must be signed in to add a milestone." });
    expect(
      await updateMilestoneAction(
        crypto.randomUUID(),
        null,
        milestoneForm(uniqueDescription()),
      ),
    ).toEqual({ error: "You must be signed in to update this milestone." });
    expect(
      await updateMilestoneStatusAction(crypto.randomUUID(), "done"),
    ).toEqual({ error: "You must be signed in to update this milestone." });
  });

  test("admin role (governance manage) can add, update and re-status a milestone", async () => {
    const description = uniqueDescription();
    const owner = await createPerson();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(
      await createMilestoneAction(owner.id, milestoneForm(description)),
    ).toEqual({ success: true });
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/portal/governance/nonprofit-status",
    );

    const created = await milestoneFor(description);
    if (!created) throw new Error("expected the created milestone");
    expect(created).toMatchObject({
      phase: "federal",
      status: "not_started",
      due_date: "2026-09-30",
      owner_person_id: owner.id,
    });

    expect(
      await updateMilestoneAction(
        created.id as string,
        null,
        milestoneForm(description, { phase: "state" }),
      ),
    ).toEqual({ success: true });
    expect(await milestoneFor(description)).toMatchObject({
      phase: "state",
      owner_person_id: null,
    });

    expect(
      await updateMilestoneStatusAction(created.id as string, "done"),
    ).toEqual({ success: true });
    expect(await milestoneFor(description)).toMatchObject({ status: "done" });

    await cleanupMilestone(description);
    await owner.cleanup();
  });

  test("board role (governance manage) can add a milestone", async () => {
    const description = uniqueDescription();
    currentSupabase = await signInAs(SEEDED_USERS.board);

    expect(
      await createMilestoneAction(null, milestoneForm(description)),
    ).toEqual({ success: true });

    await cleanupMilestone(description);
  });

  test("rejects a milestone with no phase, even for a permitted role", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.admin);
    const fd = milestoneForm(uniqueDescription(), { phase: "" });

    expect(await createMilestoneAction(null, fd)).toEqual({
      error: "Phase is required.",
    });
  });

  async function expectNoAccess(email: string) {
    const description = uniqueDescription();
    const owner = await createPerson();
    const id = await seedMilestone(description, owner.id);
    currentSupabase = await signInAs(email);

    expect(
      await createMilestoneAction(null, milestoneForm(uniqueDescription())),
    ).toEqual(DENIED);
    expect(
      await updateMilestoneAction(
        id,
        owner.id,
        milestoneForm(description, { phase: "state" }),
      ),
    ).toEqual(DENIED);
    expect(await updateMilestoneStatusAction(id, "done")).toEqual(DENIED);

    // Neither denied write landed: the actions refuse them, and the
    // `nonprofit_status_milestones update` policy would too.
    expect(await milestoneFor(description)).toMatchObject({
      phase: "federal",
      status: "not_started",
    });

    await cleanupMilestone(description);
    await owner.cleanup();
  }

  test("event_coordinator role cannot manage milestones", async () => {
    await expectNoAccess(SEEDED_USERS.coordinator);
  });

  test("finance role cannot manage milestones", async () => {
    await expectNoAccess(SEEDED_USERS.finance);
  });

  test("volunteer role cannot manage milestones", async () => {
    await expectNoAccess(SEEDED_USERS.volunteer);
  });

  test("a deactivated (former) account cannot manage milestones", async () => {
    await expectNoAccess(SEEDED_USERS.former);
  });
});
