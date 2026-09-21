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
  acknowledgeLegalDocumentAction,
  updateLayoutSettingAction,
} = await import("./settings-actions");
const { pageVisibilitySettingKey } = await import("@/lib/page-visibility");
const { legalPublicationSettingKey } = await import("@/lib/legal-documents");
const { legalAcknowledgementSettingKey, parseLegalAcknowledgement } =
  await import("@/lib/legal-acknowledgement");
const { PLATFORM_LEGAL_LAST_UPDATED } = await import("@/lib/legal-defaults");
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

/**
 * Runs `run` with this tenant publishing text of its own for `slot`, then
 * takes it away again (#1321).
 *
 * The seeded tenant has **no** `legal.*` rows at all -- local development is a
 * freshly provisioned organization, prompts and platform defaults everywhere
 * (see `docs/tenants.md`, "Local development: one tenant"), which is precisely
 * the state this ticket exists for. So the fixture that has to be built is the
 * other one: an organization that wrote its own document and therefore has
 * nothing of the platform's to confirm.
 */
async function withOwnDocument(slot: string, run: () => Promise<void>) {
  const { error } = await serviceRoleClient
    .from("site_content")
    .upsert(
      { key: slot, value: { sections: [] } },
      { onConflict: "tenant_id,key" },
    );
  if (error) throw error;
  try {
    await run();
  } finally {
    await serviceRoleClient.from("site_content").delete().eq("key", slot);
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

  // #1321. A tenant serving the platform's text has published nothing for #600
  // to gate, no version row for #601 to hold and nothing #1292 can call drift,
  // so this row is the only record that anybody there ever read the document.
  describe("confirming the platform's own text has been read", () => {
    const KEY = legalAcknowledgementSettingKey("privacy");

    test("records who read it, when, and which version they read", async () => {
      currentSupabase = await signInAs(SEEDED_USERS.admin);

      await withRestoredSetting(KEY, async () => {
        expect(await acknowledgeLegalDocumentAction("privacy")).toEqual({
          success: true,
        });

        const record = parseLegalAcknowledgement(await settingValue(KEY));
        // The version is what makes the record go stale by itself when the
        // platform next edits the prose -- without it there is nothing to
        // compare and nothing to notice.
        expect(record?.platformLastUpdated).toBe(PLATFORM_LEGAL_LAST_UPDATED);
        // Taken from the session, not from the argument: the whole value of
        // the row is that it names who read the text.
        expect(record?.personId).toBeTruthy();
        expect(record?.personName).toBeTruthy();
        expect(record?.acknowledgedAt).toBeTruthy();
        expect(revalidatePathMock).toHaveBeenCalledWith(
          "/portal/website/legal-documents",
        );
      });
    });

    // Publishing your own text is the confirmation. Refused rather than
    // swallowed: the panel offers the control in neither state, so a call that
    // gets here is a bug worth hearing about.
    test("a tenant serving its own text has nothing of ours to confirm", async () => {
      currentSupabase = await signInAs(SEEDED_USERS.admin);

      await withOwnDocument("legal.privacy", async () => {
        expect(await acknowledgeLegalDocumentAction("privacy")).toEqual({
          error:
            "Your site serves your own privacy policy, not the platform's, so there is nothing of ours to confirm.",
        });
      });
    });

    // Asking somebody to confirm they have read a page that 404s is asking for
    // a signature on a blank sheet. The code of conduct is not in force on a
    // freshly provisioned tenant, and the seed is one.
    test("a document nobody is being served has nothing to confirm", async () => {
      currentSupabase = await signInAs(SEEDED_USERS.admin);

      expect(await acknowledgeLegalDocumentAction("code_of_conduct")).toEqual({
        error:
          "Your code of conduct is not being served, so there is nothing to confirm yet.",
      });
    });

    test("something that is not a legal document is refused", async () => {
      currentSupabase = await signInAs(SEEDED_USERS.admin);

      expect(await acknowledgeLegalDocumentAction("cookies")).toEqual({
        error: "That is not a legal document.",
      });
    });

    // The same gate as the switch beside it, and checked before either refusal
    // above: a reader who reaches the Website section on `site_content:view`
    // alone is told they cannot do this, rather than told what their
    // organization is serving and then refused on the way out.
    test("a role without system_settings:manage cannot record one", async () => {
      currentSupabase = await signInAs(SEEDED_USERS.coordinator);

      expect(await acknowledgeLegalDocumentAction("privacy")).toEqual(DENIED);
      expect(await settingValue(KEY)).toBeUndefined();
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
