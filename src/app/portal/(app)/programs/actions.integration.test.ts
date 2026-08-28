// Integration test: exercises the real createProgramAction/
// updateProgramAction/listProgramsAction/listProgramEventsAction against a
// real local Supabase stack (checkUser/checkPermission, then real
// `programs` RLS). Per §5.3, `programs` is admin/event_coordinator manage,
// finance/board/volunteer view. Requires `bun run db:start && bun run
// db:reset` first; run via `bun run test:integration`. Not picked up by
// `bun run test`.
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

function programForm(overrides: { name?: string; status?: string } = {}) {
  const fd = new FormData();
  fd.set(
    "name",
    overrides.name ?? `Integration Test Program ${crypto.randomUUID()}`,
  );
  fd.set("description", "Weekend gear giveaways for local families.");
  fd.set("status", overrides.status ?? "active");
  return fd;
}

async function programByName(name: string) {
  const { data, error } = await adminClient
    .from("programs")
    .select("id, name, description, status")
    .eq("name", name)
    .maybeSingle();
  if (error) throw error;
  return data;
}

describe("createProgramAction (integration)", () => {
  test("requires a signed-in user", async () => {
    currentSupabase = anonClient();
    const result = await createProgramAction(programForm());
    expect(result).toEqual({
      error: "You must be signed in to create a program.",
    });
  });

  test("admin role (programs manage) can create a program", async () => {
    const name = `Integration Test Program ${crypto.randomUUID()}`;
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    const result = await createProgramAction(programForm({ name }));
    expect(result).toEqual({ success: true });
    expect(revalidatePathMock).toHaveBeenCalledWith("/portal/programs");
    expect(revalidatePathMock).toHaveBeenCalledWith("/portal/events");

    const created = await programByName(name);
    expect(created).toMatchObject({
      name,
      description: "Weekend gear giveaways for local families.",
      status: "active",
    });

    await adminClient.from("programs").delete().eq("name", name);
  });

  test("event_coordinator role (programs manage) can create a program", async () => {
    const name = `Integration Test Program ${crypto.randomUUID()}`;
    currentSupabase = await signInAs(SEEDED_USERS.coordinator);

    const result = await createProgramAction(programForm({ name }));
    expect(result).toEqual({ success: true });

    await adminClient.from("programs").delete().eq("name", name);
  });

  test("finance role (programs view only) cannot create a program", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.finance);
    const result = await createProgramAction(programForm());
    expect(result).toEqual(DENIED);
  });

  test("board role (programs view only) cannot create a program", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.board);
    const result = await createProgramAction(programForm());
    expect(result).toEqual(DENIED);
  });

  test("volunteer role (programs view only) cannot create a program", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.volunteer);
    const result = await createProgramAction(programForm());
    expect(result).toEqual(DENIED);
  });

  test("a deactivated (former) account cannot create a program", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.former);
    const result = await createProgramAction(programForm());
    expect(result).toEqual(DENIED);
  });
});

describe("updateProgramAction (integration)", () => {
  test("admin role (programs manage) can update a program", async () => {
    const program = await createProgram();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    const result = await updateProgramAction(
      program.id,
      programForm({ name: `Updated ${crypto.randomUUID()}`, status: "pilot" }),
    );
    expect(result).toEqual({ success: true });

    const { data } = await adminClient
      .from("programs")
      .select("status")
      .eq("id", program.id)
      .single();
    expect(data?.status).toBe("pilot");

    await program.cleanup();
  });

  test("finance role (programs view only) cannot update a program", async () => {
    const program = await createProgram();
    currentSupabase = await signInAs(SEEDED_USERS.finance);

    const result = await updateProgramAction(program.id, programForm());
    expect(result).toEqual(DENIED);

    await program.cleanup();
  });
});

describe("listProgramsAction (integration)", () => {
  test("finance role (programs view) can list programs", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.finance);
    const result = await listProgramsAction();
    expect("data" in result).toBe(true);
  });

  test("board role (programs view) can list programs", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.board);
    const result = await listProgramsAction();
    expect("data" in result).toBe(true);
  });

  test("a user with no role cannot list programs", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.noAccess);
    const result = await listProgramsAction();
    expect(result).toEqual(DENIED);
  });
});

describe("listProgramEventsAction (integration)", () => {
  test("volunteer role (events view) can list a program's events", async () => {
    const program = await createProgram();
    currentSupabase = await signInAs(SEEDED_USERS.volunteer);

    const result = await listProgramEventsAction(program.id);
    expect("data" in result).toBe(true);

    await program.cleanup();
  });

  test("a user with no role cannot list a program's events", async () => {
    const program = await createProgram();
    currentSupabase = await signInAs(SEEDED_USERS.noAccess);

    const result = await listProgramEventsAction(program.id);
    expect(result).toEqual(DENIED);

    await program.cleanup();
  });
});
