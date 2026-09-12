// Integration test: the three settings actions that moved to the Website
// section with their panels in #990, against a real local Supabase stack.
//
// The point of the file is the acceptance criterion the ticket set: "check
// each moved panel's server action gates on something the reader has". They
// go through `writeAppSetting`, which checks `system_settings:manage` -- the
// resource did not change because the page moved. That is why the Website
// section's gate became a union and why these three nav entries ask for
// `system_settings:manage` rather than `site_content:view`: the board must get
// in, and a content editor holding only `site_content` must not be offered a
// page whose every switch would refuse to save.
//
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterEach, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SEEDED_USERS, signInAs } from "../../../../../test/integration-setup";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

// `app_settings` grants authenticated only insert/update, never delete, so the
// service-role client is the only way to restore a shared key afterwards.
mock.module("server-only", () => ({}));
const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
const serviceRoleClient = createSupabaseAdminClient();

const {
  updatePageVisibilityAction,
  updateLegalPublicationAction,
  updateLayoutSettingAction,
} = await import("./settings-actions");
const { pageVisibilitySettingKey } = await import("@/lib/page-visibility");
const { legalPublicationSettingKey } = await import("@/lib/legal-documents");
const { LAYOUT_SLOTS, layoutSettingKey } = await import("@/lib/site-layout");

afterEach(() => {
  revalidatePathMock.mockClear();
});

const DENIED = { error: "You don't have permission to perform this action." };

async function settingValue(key: string) {
  const { data, error } = await serviceRoleClient
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error) throw error;
  return data?.value;
}

/** Runs `run`, then puts the shared key back the way it was. */
async function withRestoredSetting(key: string, run: () => Promise<void>) {
  const original = await settingValue(key);
  try {
    await run();
  } finally {
    if (original === undefined) {
      await serviceRoleClient.from("app_settings").delete().eq("key", key);
    } else {
      await serviceRoleClient
        .from("app_settings")
        .update({ value: original })
        .eq("key", key);
    }
  }
}

const LAYOUT_SLOT = LAYOUT_SLOTS[0];

describe("website settings actions (integration)", () => {
  test("board keeps every control that moved out of Administration", async () => {
    // The objection the research raised against moving Page visibility: the
    // board operates it and holds no site_content at all. This is the proof
    // that widening the section gate answered it -- board writes all three.
    currentSupabase = await signInAs(SEEDED_USERS.board);

    await withRestoredSetting(pageVisibilitySettingKey("events"), async () => {
      expect(await updatePageVisibilityAction("events", false)).toEqual({
        success: true,
      });
      expect(await settingValue(pageVisibilitySettingKey("events"))).toBe(
        false,
      );
    });

    await withRestoredSetting(legalPublicationSettingKey("terms"), async () => {
      expect(await updateLegalPublicationAction("terms", true)).toEqual({
        success: true,
      });
      expect(await settingValue(legalPublicationSettingKey("terms"))).toBe(
        true,
      );
    });

    await withRestoredSetting(layoutSettingKey(LAYOUT_SLOT.key), async () => {
      const value = LAYOUT_SLOT.options[0].value;
      expect(await updateLayoutSettingAction(LAYOUT_SLOT.key, value)).toEqual({
        success: true,
      });
      expect(await settingValue(layoutSettingKey(LAYOUT_SLOT.key))).toBe(value);
    });
  });

  // The half that makes the nav gate right rather than merely convenient. A
  // content editor reaches the Website section on site_content:view, so
  // without this the three moved entries would be links to pages whose every
  // switch fails -- which is why nav.ts asks for system_settings:manage.
  const ROLES_WITHOUT_SYSTEM_SETTINGS = [
    ["event_coordinator", SEEDED_USERS.coordinator],
    ["finance", SEEDED_USERS.finance],
    ["volunteer", SEEDED_USERS.volunteer],
  ] as const;

  for (const [label, email] of ROLES_WITHOUT_SYSTEM_SETTINGS) {
    test(`${label} cannot write any of the three`, async () => {
      currentSupabase = await signInAs(email);

      expect(await updatePageVisibilityAction("events", false)).toEqual(DENIED);
      expect(await updateLegalPublicationAction("terms", true)).toEqual(DENIED);
      expect(
        await updateLayoutSettingAction(
          LAYOUT_SLOT.key,
          LAYOUT_SLOT.options[0].value,
        ),
      ).toEqual(DENIED);
    });
  }

  test("the privacy policy cannot be taken out of force", async () => {
    // Refused outright rather than silently ignored: it is served for every
    // tenant, always, so a call asking to take it down is a bug worth hearing
    // about (#859).
    currentSupabase = await signInAs(SEEDED_USERS.admin);
    const result = await updateLegalPublicationAction("privacy", false);
    expect(result).toEqual({
      error: "The privacy policy is always served.",
    });
  });

  test("a layout value nobody offered is refused", async () => {
    // A Server Action's arguments are whatever the caller sent, so the slot's
    // own option list is the validation (#846).
    currentSupabase = await signInAs(SEEDED_USERS.admin);
    expect(
      await updateLayoutSettingAction(LAYOUT_SLOT.key, "not-an-option"),
    ).toEqual({ error: "That isn't one of the options for this setting." });
    expect(await updateLayoutSettingAction("not-a-slot", "whatever")).toEqual({
      error: "That isn't one of the options for this setting.",
    });
  });

  test("each action revalidates its own new route", async () => {
    // They all revalidated the settings page before the move; now each names
    // the page it became.
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    await withRestoredSetting(pageVisibilitySettingKey("events"), async () => {
      await updatePageVisibilityAction("events", false);
      expect(revalidatePathMock).toHaveBeenCalledWith(
        "/portal/website/page-visibility",
      );
    });
  });
});
