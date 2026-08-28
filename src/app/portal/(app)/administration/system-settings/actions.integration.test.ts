// Integration test: exercises the real app_settings Server Actions
// (checkPermission, then the real `app_settings` RLS) against a real local
// Supabase stack. No integration test previously touched `system_settings`
// or `app_settings` writes -- finance/expenses and finance/reimbursements
// only read the seeded threshold. Distinct from every other Administration
// section: gated on `system_settings`, which admin AND board can manage
// (per 20260823040000_create_app_settings.sql), not `administration`.
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterEach, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  anonClient,
  signInAs,
} from "../../../../../../test/integration-setup";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

// admin.ts imports "server-only" -- stub it so this plain `bun test` run can
// import the real module. Needed here because app_settings grants
// authenticated only insert/update, never delete (see the comment on
// updateSiteImageAction) -- the service-role client is the only way to clean
// up a test-only key or restore a shared one to its original value.
mock.module("server-only", () => ({}));
const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
const serviceRoleClient = createSupabaseAdminClient();

const {
  updateAppSettingAction,
  updateExpenseApprovalThresholdAction,
  updateReimbursementApprovalThresholdAction,
  updateSiteImageAction,
} = await import("./actions");

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

async function deleteSetting(key: string) {
  await serviceRoleClient.from("app_settings").delete().eq("key", key);
}

function thresholdForm(value: string) {
  const fd = new FormData();
  fd.set("threshold", value);
  return fd;
}

function siteImageForm(url: string) {
  const fd = new FormData();
  fd.set("url", url);
  return fd;
}

// Reads a shared setting's current value, runs `run`, then restores the
// original value via the service-role client -- since other integration
// test files (finance/expenses, finance/reimbursements) read this same key,
// this must not leave it mutated for whichever test file runs next.
async function withRestoredSetting(key: string, run: () => Promise<void>) {
  const original = await settingValue(key);
  try {
    await run();
  } finally {
    if (original === undefined) {
      await deleteSetting(key);
    } else {
      await serviceRoleClient
        .from("app_settings")
        .update({ value: original })
        .eq("key", key);
    }
  }
}

describe("administration/system-settings actions (integration)", () => {
  test("requires system_settings:manage to update a setting", async () => {
    currentSupabase = anonClient();
    expect(
      await updateAppSettingAction("integration_test.probe", "value"),
    ).toEqual(DENIED);
  });

  test("threshold actions validate the amount before checking permission", async () => {
    currentSupabase = anonClient();

    expect(
      await updateExpenseApprovalThresholdAction(thresholdForm("not-a-number")),
    ).toEqual({ error: "Threshold must be a positive number." });
    expect(
      await updateExpenseApprovalThresholdAction(thresholdForm("-5")),
    ).toEqual({ error: "Threshold must be a positive number." });
    expect(
      await updateReimbursementApprovalThresholdAction(
        thresholdForm("not-a-number"),
      ),
    ).toEqual({ error: "Threshold must be a positive number." });

    // A valid amount clears validation, so this reaches (and fails) the
    // permission check instead.
    expect(
      await updateExpenseApprovalThresholdAction(thresholdForm("750")),
    ).toEqual(DENIED);
  });

  test("admin can update a generic setting, both thresholds and a site image", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(
      await updateAppSettingAction("integration_test.probe", { foo: "bar" }),
    ).toEqual({ success: true });
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/portal/administration/system-settings",
    );
    expect(await settingValue("integration_test.probe")).toEqual({
      foo: "bar",
    });
    // Upsert on `key`: re-applying changes the value rather than erroring.
    expect(
      await updateAppSettingAction("integration_test.probe", { foo: "baz" }),
    ).toEqual({ success: true });
    expect(await settingValue("integration_test.probe")).toEqual({
      foo: "baz",
    });
    await deleteSetting("integration_test.probe");

    await withRestoredSetting(
      "finance.expense_approval_threshold",
      async () => {
        expect(
          await updateExpenseApprovalThresholdAction(thresholdForm("750")),
        ).toEqual({ success: true });
        expect(await settingValue("finance.expense_approval_threshold")).toBe(
          750,
        );
      },
    );

    await withRestoredSetting(
      "finance.reimbursement_approval_threshold",
      async () => {
        expect(
          await updateReimbursementApprovalThresholdAction(
            thresholdForm("600"),
          ),
        ).toEqual({ success: true });
        expect(
          await settingValue("finance.reimbursement_approval_threshold"),
        ).toBe(600);
      },
    );

    expect(
      await updateSiteImageAction(
        "gear_placeholder",
        siteImageForm("https://example.test/gear.jpg"),
      ),
    ).toEqual({ success: true });
    expect(await settingValue("site_images.gear_placeholder")).toBe(
      "https://example.test/gear.jpg",
    );
    await deleteSetting("site_images.gear_placeholder");
  });

  // system_settings is admin AND board (both 'manage') -- unlike every other
  // Administration resource, which is admin-only. This proves the actions
  // gate on system_settings, not on administration: board holds
  // administration:none but must still be let in.
  test("board (system_settings manage, not administration) can update settings too", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.board);

    expect(
      await updateAppSettingAction("integration_test.probe_board", "value"),
    ).toEqual({ success: true });
    expect(await settingValue("integration_test.probe_board")).toBe("value");
    await deleteSetting("integration_test.probe_board");
  });

  // Every seeded role except admin and board holds system_settings:none.
  const ROLES_WITHOUT_SYSTEM_SETTINGS = [
    ["event_coordinator", SEEDED_USERS.coordinator],
    ["finance", SEEDED_USERS.finance],
    ["volunteer", SEEDED_USERS.volunteer],
    ["multi-role (event_coordinator + volunteer)", SEEDED_USERS.multi],
    ["no-role", SEEDED_USERS.noAccess],
    ["deactivated (former)", SEEDED_USERS.former],
  ] as const;

  for (const [label, email] of ROLES_WITHOUT_SYSTEM_SETTINGS) {
    test(`${label} account cannot update settings`, async () => {
      currentSupabase = await signInAs(email);
      const key = `integration_test.denied_${crypto.randomUUID()}`;

      expect(await updateAppSettingAction(key, "value")).toEqual(DENIED);
      expect(
        await updateExpenseApprovalThresholdAction(thresholdForm("750")),
      ).toEqual(DENIED);
      expect(
        await updateReimbursementApprovalThresholdAction(thresholdForm("600")),
      ).toEqual(DENIED);
      expect(
        await updateSiteImageAction(
          "gear_placeholder",
          siteImageForm("https://example.test/denied.jpg"),
        ),
      ).toEqual(DENIED);

      expect(await settingValue(key)).toBeUndefined();
    });
  }
});
