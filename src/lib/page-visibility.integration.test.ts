// Integration coverage for the public_page_visibility view (issue #584):
// the public site reads these flags as `anon`, so the view must expose the
// page_visibility.* slice of app_settings and nothing else.
import { afterAll, describe, expect, test } from "bun:test";
import {
  anonClient,
  signInAs,
  SEEDED_USERS,
} from "../../test/integration-setup";
import { getPageVisibility, pageVisibilitySettingKey } from "./page-visibility";

const anon = anonClient();

// seed.sql turns these three on for local/CI; restore whatever we change.
afterAll(async () => {
  const board = await signInAs(SEEDED_USERS.board);
  await board
    .from("app_settings")
    .upsert(
      { key: pageVisibilitySettingKey("programs"), value: true },
      { onConflict: "key" },
    );
});

describe("public_page_visibility", () => {
  test("is readable without authentication", async () => {
    const { data, error } = await anon
      .from("public_page_visibility")
      .select("slot, value");

    expect(error).toBeNull();
    expect(data).toBeTruthy();
  });

  test("exposes only page_visibility.* keys", async () => {
    const { data } = await anon
      .from("public_page_visibility")
      .select("slot, value");

    const slots = (data ?? []).map((row) => row.slot);
    // The finance thresholds live in the same table and must not leak.
    expect(slots).not.toContain("finance.expense_approval_threshold");
    for (const slot of slots) {
      expect(slot).not.toContain(".");
    }
  });

  test("anon still cannot read app_settings directly", async () => {
    const { data, error } = await anon.from("app_settings").select("key");

    // RLS grants select only to authenticated users with the right permission,
    // so anon gets either an error or an empty set -- never rows.
    expect(error ?? data?.length === 0).toBeTruthy();
  });
});

describe("board-controlled toggles", () => {
  test("a board member's write is visible to the anonymous public site", async () => {
    const board = await signInAs(SEEDED_USERS.board);

    const { error } = await board
      .from("app_settings")
      .upsert(
        { key: pageVisibilitySettingKey("programs"), value: false },
        { onConflict: "key" },
      );
    expect(error).toBeNull();

    const visibility = await getPageVisibility(anonClient());
    expect(visibility.programs).toBe(false);
  });

  test("a volunteer cannot change page visibility", async () => {
    const volunteer = await signInAs(SEEDED_USERS.volunteer);

    const { error } = await volunteer
      .from("app_settings")
      .upsert(
        { key: pageVisibilitySettingKey("contact"), value: false },
        { onConflict: "key" },
      );

    expect(error).not.toBeNull();
  });
});
