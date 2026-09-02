// Integration test: exercises the real board member Server Actions against a
// real local Supabase stack (checkUser/checkPermission, then real
// `board_members` RLS). Every governance page shares the single `governance`
// resource key (board manages, every other role is 'none'), so this file
// proves this page's own actions use that key at the right level rather than
// re-proving the gate itself. Requires `bun run db:start && bun run db:reset`
// first; run via `bun run test:integration`. Not picked up by `bun run test`.
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
  createBoardMemberAction,
  updateBoardMemberAction,
  listBoardMembersAction,
} = await import("./actions");

afterEach(() => {
  revalidatePathMock.mockClear();
});

const DENIED = { error: "You don't have permission to perform this action." };

function boardMemberForm(
  overrides: { roleTitle?: string; termEnd?: string; isActive?: boolean } = {},
) {
  const fd = new FormData();
  fd.set("roleTitle", overrides.roleTitle ?? "Treasurer");
  fd.set("termStart", "2026-01-01");
  if (overrides.termEnd) fd.set("termEnd", overrides.termEnd);
  if (overrides.isActive ?? true) fd.set("isActive", "on");
  fd.set("notes", "Elected at the annual meeting");
  return fd;
}

async function boardMemberFor(personId: string) {
  const { data, error } = await adminClient
    .from("board_members")
    .select("id, role_title, term_start, term_end, is_active, notes")
    .eq("person_id", personId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Seeds one active term via the real action (as admin) so denied-role cases
// have an existing row to attempt an update against.
async function seedBoardMember(personId: string) {
  currentSupabase = await signInAs(SEEDED_USERS.admin);
  const result = await createBoardMemberAction(personId, boardMemberForm());
  if ("error" in result) throw new Error(result.error);
  const row = await boardMemberFor(personId);
  if (!row) throw new Error("expected a seeded board member");
  return row.id as string;
}

describe("board member actions (integration)", () => {
  test("requires a signed-in user", async () => {
    currentSupabase = anonClient();

    expect(
      await createBoardMemberAction(crypto.randomUUID(), boardMemberForm()),
    ).toEqual({ error: "You must be signed in to add a board member." });
    expect(
      await updateBoardMemberAction(crypto.randomUUID(), boardMemberForm()),
    ).toEqual({ error: "You must be signed in to update this board member." });
    // listBoardMembersAction has no checkUser guard -- an anonymous client
    // holds no permissions, so it falls through to the permission check.
    expect(await listBoardMembersAction()).toEqual(DENIED);
  });

  test("admin role (governance manage) can add, list and update a board member", async () => {
    const person = await createPerson();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(await createBoardMemberAction(person.id, boardMemberForm())).toEqual(
      { success: true },
    );
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/portal/governance/board-members",
    );

    const created = await boardMemberFor(person.id);
    if (!created) throw new Error("expected the created board member");
    expect(created).toMatchObject({
      role_title: "Treasurer",
      term_start: "2026-01-01",
      term_end: null,
      is_active: true,
      notes: "Elected at the annual meeting",
    });

    const listed = await listBoardMembersAction();
    if (!("data" in listed)) throw new Error("expected data");
    expect(listed.data.some((member) => member.person.id === person.id)).toBe(
      true,
    );

    expect(
      await updateBoardMemberAction(
        created.id as string,
        boardMemberForm({ roleTitle: "President", termEnd: "2026-12-31" }),
      ),
    ).toEqual({ success: true });

    const updated = await boardMemberFor(person.id);
    expect(updated).toMatchObject({
      role_title: "President",
      term_end: "2026-12-31",
    });

    await adminClient.from("board_members").delete().eq("person_id", person.id);
    await person.cleanup();
  });

  test("board role (governance manage) can add a board member", async () => {
    const person = await createPerson();
    currentSupabase = await signInAs(SEEDED_USERS.board);

    expect(await createBoardMemberAction(person.id, boardMemberForm())).toEqual(
      { success: true },
    );

    await adminClient.from("board_members").delete().eq("person_id", person.id);
    await person.cleanup();
  });

  test("a person cannot hold two active terms at once", async () => {
    const person = await createPerson();
    await seedBoardMember(person.id);

    expect(await createBoardMemberAction(person.id, boardMemberForm())).toEqual(
      {
        error:
          "This person already has an active board term. Edit their existing entry instead.",
      },
    );

    await adminClient.from("board_members").delete().eq("person_id", person.id);
    await person.cleanup();
  });

  test("requires a person to link, even for a permitted role", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.admin);
    expect(await createBoardMemberAction("", boardMemberForm())).toEqual({
      error: "Select or create a person to link.",
    });
  });

  // The four accounts with no governance access at all. Each gets its own
  // test so a regression names the role that regressed.
  async function expectNoAccess(email: string) {
    const person = await createPerson();
    const memberId = await seedBoardMember(person.id);
    currentSupabase = await signInAs(email);

    expect(await listBoardMembersAction()).toEqual(DENIED);
    expect(await createBoardMemberAction(person.id, boardMemberForm())).toEqual(
      DENIED,
    );
    expect(
      await updateBoardMemberAction(
        memberId,
        boardMemberForm({ roleTitle: "Usurper" }),
      ),
    ).toEqual(DENIED);

    // The denied update must not have landed: the action refuses it, and the
    // `board_members update` policy would too.
    const unchanged = await boardMemberFor(person.id);
    expect(unchanged).toMatchObject({ role_title: "Treasurer" });

    await adminClient.from("board_members").delete().eq("person_id", person.id);
    await person.cleanup();
  }

  test("event_coordinator role cannot list, add or update board members", async () => {
    await expectNoAccess(SEEDED_USERS.coordinator);
  });

  test("finance role cannot list, add or update board members", async () => {
    await expectNoAccess(SEEDED_USERS.finance);
  });

  test("volunteer role cannot list, add or update board members", async () => {
    await expectNoAccess(SEEDED_USERS.volunteer);
  });

  test("a deactivated (former) account cannot list, add or update board members", async () => {
    await expectNoAccess(SEEDED_USERS.former);
  });
});
