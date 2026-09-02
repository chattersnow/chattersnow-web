// Integration test: exercises the real bylaws Server Actions against a real
// local Supabase stack (checkUser/checkPermission, then real `bylaws` RLS).
// The page shares the `governance` resource key with the rest of governance
// (board manages, every other role is 'none'), so what this file proves is
// that these actions ask for that key at the right level -- a wrong key or a
// missing check here would not be caught anywhere else. Requires
// `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterEach, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  anonClient,
  signInAs,
} from "../../../../../../test/integration-setup";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const { createBylawsAction, updateBylawsAction } =
  await import("./bylaws-actions");

afterEach(() => {
  revalidatePathMock.mockClear();
});

const DENIED = { error: "You don't have permission to perform this action." };

// `bylaws` has no natural unique key and the seed may hold rows of its own,
// so every test tags its row with a random version string and looks that up
// rather than reading "the most recent row".
function bylawsForm(version: string, overrides: { summary?: string } = {}) {
  const fd = new FormData();
  fd.set("version", version);
  fd.set("effectiveDate", "2026-03-01");
  fd.set("amendmentSummary", overrides.summary ?? "Initial adoption");
  fd.set("externalLink", "https://example.test/bylaws.pdf");
  fd.set("bodyText", "Article I. Name.");
  return fd;
}

function uniqueVersion() {
  return `it-${crypto.randomUUID()}`;
}

async function bylawsRowFor(version: string) {
  const { data, error } = await adminClient
    .from("bylaws")
    .select("id, version, effective_date, amendment_summary, external_link")
    .eq("version", version)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function seedBylaws(version: string) {
  currentSupabase = await signInAs(SEEDED_USERS.admin);
  const result = await createBylawsAction(bylawsForm(version));
  if ("error" in result) throw new Error(result.error);
  const row = await bylawsRowFor(version);
  if (!row) throw new Error("expected a seeded bylaws row");
  return row.id as string;
}

async function cleanupBylaws(version: string) {
  await adminClient.from("bylaws").delete().eq("version", version);
}

describe("bylaws actions (integration)", () => {
  test("requires a signed-in user", async () => {
    currentSupabase = anonClient();

    expect(await createBylawsAction(bylawsForm(uniqueVersion()))).toEqual({
      error: "You must be signed in to add a bylaws version.",
    });
    expect(
      await updateBylawsAction(crypto.randomUUID(), bylawsForm("v1")),
    ).toEqual({
      error: "You must be signed in to update this bylaws version.",
    });
  });

  test("admin role (governance manage) can add and update a bylaws version", async () => {
    const version = uniqueVersion();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(await createBylawsAction(bylawsForm(version))).toEqual({
      success: true,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/portal/governance/bylaws",
    );

    const created = await bylawsRowFor(version);
    if (!created) throw new Error("expected the created bylaws row");
    expect(created).toMatchObject({
      effective_date: "2026-03-01",
      amendment_summary: "Initial adoption",
      external_link: "https://example.test/bylaws.pdf",
    });

    expect(
      await updateBylawsAction(
        created.id as string,
        bylawsForm(version, { summary: "Amended quorum rules" }),
      ),
    ).toEqual({ success: true });

    const updated = await bylawsRowFor(version);
    expect(updated).toMatchObject({
      amendment_summary: "Amended quorum rules",
    });

    await cleanupBylaws(version);
  });

  test("board role (governance manage) can add a bylaws version", async () => {
    const version = uniqueVersion();
    currentSupabase = await signInAs(SEEDED_USERS.board);

    expect(await createBylawsAction(bylawsForm(version))).toEqual({
      success: true,
    });

    await cleanupBylaws(version);
  });

  test("rejects a version with no effective date, even for a permitted role", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.admin);
    const fd = bylawsForm(uniqueVersion());
    fd.set("effectiveDate", "");

    expect(await createBylawsAction(fd)).toEqual({
      error: "Effective date is required.",
    });
  });

  async function expectNoAccess(email: string) {
    const version = uniqueVersion();
    const id = await seedBylaws(version);
    currentSupabase = await signInAs(email);

    expect(await createBylawsAction(bylawsForm(uniqueVersion()))).toEqual(
      DENIED,
    );
    expect(
      await updateBylawsAction(
        id,
        bylawsForm(version, { summary: "Rewritten by an unauthorized role" }),
      ),
    ).toEqual(DENIED);

    // The denied update must not have landed: the action refuses it, and the
    // `bylaws update` policy would too.
    expect(await bylawsRowFor(version)).toMatchObject({
      amendment_summary: "Initial adoption",
    });

    await cleanupBylaws(version);
  }

  test("event_coordinator role cannot add or update bylaws", async () => {
    await expectNoAccess(SEEDED_USERS.coordinator);
  });

  test("finance role cannot add or update bylaws", async () => {
    await expectNoAccess(SEEDED_USERS.finance);
  });

  test("volunteer role cannot add or update bylaws", async () => {
    await expectNoAccess(SEEDED_USERS.volunteer);
  });

  test("a deactivated (former) account cannot add or update bylaws", async () => {
    await expectNoAccess(SEEDED_USERS.former);
  });
});
