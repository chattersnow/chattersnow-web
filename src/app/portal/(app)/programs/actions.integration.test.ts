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

function programForm(name: string, overrides: { status?: string } = {}) {
  const fd = new FormData();
  fd.set("name", name);
  fd.set("description", "Integration test program");
  fd.set("status", overrides.status ?? "active");
  return fd;
}

async function programRowFor(name: string) {
  const { data, error } = await adminClient
    .from("programs")
    .select("id, name, status, description")
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
});
