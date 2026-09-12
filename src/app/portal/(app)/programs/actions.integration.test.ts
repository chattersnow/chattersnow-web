// Integration test: exercises the real programs Server Actions against a
// real local Supabase stack (checkUser/checkPermission, then real `programs`
// RLS). Programs are their own resource key (admin/event_coordinator manage;
// finance/board/volunteer view), and listProgramEventsAction gates on
// events:view instead -- so what this file proves is that each action asks
// for the right key at the right level; a wrong key or a missing check here
// would not be caught anywhere else. Requires
// `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterEach, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  anonClient,
  createProgram,
  createPublishedEvent,
  signInAs,
} from "../../../../../test/integration-setup";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const {
  createProgramAction,
  updateProgramAction,
  listProgramsAction,
  listProgramEventsAction,
  listProgramPillarsAction,
} = await import("./actions");

afterEach(() => {
  revalidatePathMock.mockClear();
});

const DENIED = { error: "You don't have permission to perform this action." };

// `programs.name` is unique, so every test tags its row with a random name
// and looks that up rather than reading "the most recent row".
function uniqueName() {
  return `IT Program ${crypto.randomUUID()}`;
}

function programForm(
  name: string,
  overrides: {
    status?: string;
    is_public?: string;
    pillar?: string;
    emoji?: string;
    sort_order?: string;
  } = {},
) {
  const fd = new FormData();
  fd.set("name", name);
  fd.set("description", "Integration test program");
  fd.set("status", overrides.status ?? "active");
  for (const key of ["is_public", "pillar", "emoji", "sort_order"] as const) {
    if (overrides[key] !== undefined) fd.set(key, overrides[key]);
  }
  return fd;
}

async function programRowFor(name: string) {
  const { data, error } = await adminClient
    .from("programs")
    .select(
      "id, name, status, description, is_public, pillar, emoji, sort_order",
    )
    .eq("name", name)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function cleanupProgram(name: string) {
  await adminClient.from("programs").delete().eq("name", name);
}

describe("programs actions (integration)", () => {
  test("requires a signed-in user for writes", async () => {
    currentSupabase = anonClient();

    expect(await createProgramAction(programForm(uniqueName()))).toEqual({
      error: "You must be signed in to create a program.",
    });
    expect(
      await updateProgramAction(crypto.randomUUID(), programForm("Any")),
    ).toEqual({
      error: "You must be signed in to update a program.",
    });
  });

  test("admin role (programs manage) can create and update a program", async () => {
    const name = uniqueName();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(await createProgramAction(programForm(name))).toEqual({
      success: true,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/portal/programs");

    const created = await programRowFor(name);
    if (!created) throw new Error("expected the created program row");
    expect(created).toMatchObject({ status: "active" });

    expect(
      await updateProgramAction(
        created.id as string,
        programForm(name, { status: "retired" }),
      ),
    ).toEqual({ success: true });
    expect(await programRowFor(name)).toMatchObject({ status: "retired" });

    await cleanupProgram(name);
  });

  test("event_coordinator role (programs manage) can create a program", async () => {
    const name = uniqueName();
    currentSupabase = await signInAs(SEEDED_USERS.coordinator);

    expect(await createProgramAction(programForm(name))).toEqual({
      success: true,
    });

    await cleanupProgram(name);
  });

  test("duplicate names surface the friendly unique-violation message", async () => {
    const name = uniqueName();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(await createProgramAction(programForm(name))).toEqual({
      success: true,
    });
    expect(await createProgramAction(programForm(name))).toEqual({
      error: "A program with this name already exists.",
    });

    await cleanupProgram(name);
  });

  async function expectNoWriteAccess(email: string) {
    const program = await createProgram();
    currentSupabase = await signInAs(email);

    expect(await createProgramAction(programForm(uniqueName()))).toEqual(
      DENIED,
    );
    expect(
      await updateProgramAction(
        program.id,
        programForm(uniqueName(), { status: "retired" }),
      ),
    ).toEqual(DENIED);

    // The denied update must not have landed: the action refuses it, and the
    // `programs update` policy would too.
    const { data } = await adminClient
      .from("programs")
      .select("status")
      .eq("id", program.id)
      .single();
    expect(data?.status).toBe("active");

    await program.cleanup();
  }

  test("finance role (programs view) cannot create or update programs", async () => {
    await expectNoWriteAccess(SEEDED_USERS.finance);
  });

  test("board role (programs view) cannot create or update programs", async () => {
    await expectNoWriteAccess(SEEDED_USERS.board);
  });

  test("volunteer role (programs view) cannot create or update programs", async () => {
    await expectNoWriteAccess(SEEDED_USERS.volunteer);
  });

  test("a deactivated (former) account cannot create or update programs", async () => {
    await expectNoWriteAccess(SEEDED_USERS.former);
  });

  test("view-level roles can list programs", async () => {
    for (const email of [
      SEEDED_USERS.finance,
      SEEDED_USERS.board,
      SEEDED_USERS.volunteer,
    ]) {
      currentSupabase = await signInAs(email);
      expect("data" in (await listProgramsAction())).toBe(true);
    }
  });

  test("a user with no role cannot list programs", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.noAccess);
    expect(await listProgramsAction()).toEqual(DENIED);
  });

  // #898/#360: the public fields, end to end. The default is the load-bearing
  // one -- an operator who never touches the new switch must not find their
  // programs on the public website.
  test("a program created without the public fields is not public", async () => {
    const name = uniqueName();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(await createProgramAction(programForm(name))).toEqual({
      success: true,
    });
    expect(await programRowFor(name)).toMatchObject({
      is_public: false,
      pillar: null,
      emoji: null,
      sort_order: null,
    });

    await cleanupProgram(name);
  });

  test("the public fields round-trip, and publishing reaches the public view", async () => {
    const name = uniqueName();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(
      await createProgramAction(
        programForm(name, {
          is_public: "true",
          pillar: "Access",
          emoji: "❄️",
          sort_order: "4",
        }),
      ),
    ).toEqual({ success: true });

    const created = await programRowFor(name);
    if (!created) throw new Error("expected the created program row");
    expect(created).toMatchObject({
      is_public: true,
      pillar: "Access",
      emoji: "❄️",
      sort_order: 4,
    });

    // The public page renders `public_programs` as `anon`, and the seeded
    // tenant is the only one here, so the row has to be visible through it.
    const visible = await anonClient()
      .from("public_programs")
      .select("name, pillar, emoji, sort_order")
      .eq("name", name)
      .maybeSingle();
    expect(visible.data).toMatchObject({ pillar: "Access", sort_order: 4 });

    // Saving is a publish, so the public page has to be revalidated too.
    expect(revalidatePathMock).toHaveBeenCalledWith("/programs");

    // Unpublishing takes it straight back out of the public view.
    expect(
      await updateProgramAction(
        created.id as string,
        programForm(name, { pillar: "Access" }),
      ),
    ).toEqual({ success: true });
    const afterUnpublish = await anonClient()
      .from("public_programs")
      .select("name")
      .eq("name", name);
    expect(afterUnpublish.data).toEqual([]);

    await cleanupProgram(name);
  });

  test("anon cannot read an unpublished program through the public view", async () => {
    const program = await createProgram();

    const { data } = await anonClient()
      .from("public_programs")
      .select("name")
      .eq("id", program.id);
    expect(data).toEqual([]);

    await program.cleanup();
  });

  test("list_program_pillars is for programs:manage, and reads published copy", async () => {
    // admin manages programs and also holds site_content:view.
    currentSupabase = await signInAs(SEEDED_USERS.admin);
    const asAdmin = await listProgramPillarsAction();
    expect("data" in asAdmin && asAdmin.data).toEqual(["Access", "Community"]);

    // The point of the RPC: event_coordinator manages programs and cannot read
    // site_content at all, so a direct select would return nothing here.
    currentSupabase = await signInAs(SEEDED_USERS.coordinator);
    const asCoordinator = await listProgramPillarsAction();
    expect("data" in asCoordinator && asCoordinator.data).toEqual([
      "Access",
      "Community",
    ]);

    // A view-only role has no business writing programs, so it is not offered
    // the pillars either.
    currentSupabase = await signInAs(SEEDED_USERS.board);
    expect(await listProgramPillarsAction()).toEqual(DENIED);
  });

  test("listProgramEventsAction gates on events:view, not programs:view", async () => {
    const program = await createProgram();

    // volunteer holds events:view -> allowed.
    currentSupabase = await signInAs(SEEDED_USERS.volunteer);
    expect("data" in (await listProgramEventsAction(program.id))).toBe(true);

    // board holds programs:view but no events access -> denied, proving the
    // action asks for the events key rather than inheriting programs:view.
    currentSupabase = await signInAs(SEEDED_USERS.board);
    expect(await listProgramEventsAction(program.id)).toEqual(DENIED);

    await program.cleanup();
  });

  // The action reads through the event_programs join table now, so the same
  // event legitimately shows up under every program it counts toward.
  test("listProgramEventsAction returns events linked through the join table", async () => {
    const programA = await createProgram();
    const programB = await createProgram();
    const shared = await createPublishedEvent();
    const onlyA = await createPublishedEvent();

    const linked = await adminClient.from("event_programs").insert([
      { event_id: shared.id, program_id: programA.id },
      { event_id: shared.id, program_id: programB.id },
      { event_id: onlyA.id, program_id: programA.id },
    ]);
    if (linked.error) throw linked.error;

    currentSupabase = await signInAs(SEEDED_USERS.admin);

    const forA = await listProgramEventsAction(programA.id);
    expect("data" in forA && forA.data.map((event) => event.id).sort()).toEqual(
      [shared.id, onlyA.id].sort(),
    );

    const forB = await listProgramEventsAction(programB.id);
    expect("data" in forB && forB.data.map((event) => event.id)).toEqual([
      shared.id,
    ]);
    // The join column is stripped, so callers still get a plain ProgramEvent.
    expect("data" in forB && Object.keys(forB.data[0]).sort()).toEqual([
      "id",
      "name",
      "starts_at",
      "status",
      "visibility",
    ]);

    await shared.cleanup();
    await onlyA.cleanup();
    await programA.cleanup();
    await programB.cleanup();
  });
});
