"use server";

import {
  getTenantModules,
  pageVisibilitySettingKey,
} from "@/lib/page-visibility";
import {
  gatesHolding,
  legalDocument,
  legalPublicationSettingKey,
} from "@/lib/legal-documents";
import { legalAcknowledgementSettingKey } from "@/lib/legal-acknowledgement";
import { PLATFORM_LEGAL_LAST_UPDATED } from "@/lib/legal-defaults";
import {
  getTenantLegalPublication,
  getTenantOwnLegalDocuments,
} from "@/lib/legal-publication";
import { resolveCurrentPerson } from "@/lib/auth/current-person";
import { checkPermission } from "@/lib/auth/permissions";
import { personDisplayName } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  LAYOUT_SLOTS,
  isLayoutValue,
  layoutSettingKey,
  type LayoutValue,
} from "@/lib/site-layout";
import {
  writeAppSetting,
  type SettingActionResult,
} from "@/lib/settings/write-app-setting";
// The type is re-exported from @/lib/settings/write-app-setting rather than
// here: a "use server" module may only export async functions to its callers,
// and the panels want both.

/**
 * The three settings actions that came with their panels when #990 moved
 * Layout, Page visibility and Legal documents out of Administration.
 *
 * They still gate on `system_settings:manage` -- `writeAppSetting` is the
 * single check for every `app_settings` write, and the resource did not change
 * because the page moved. That is the reason the Website section's gate became
 * a two-resource union (`website/layout.tsx`) and the reason these three nav
 * entries ask for `system_settings:manage` rather than `site_content:view`: a
 * reader who can only see the link is a reader whose save would fail, and the
 * sidebar should not offer it.
 *
 * Every write here is audit-logged by the `app_settings` trigger, which is
 * what makes each of these a record of a decision rather than a rumour.
 */

// Each action revalidates its own panel, which is what the settings page did
// for all three before the move. The public site is deliberately not
// revalidated here either: that was not this action's job before #990 and
// making it so would be a caching change riding along with a nav one.
const LAYOUT_PATHS = ["/portal/website/page-layout"] as const;
const VISIBILITY_PATHS = ["/portal/website/page-visibility"] as const;
const LEGAL_PATHS = ["/portal/website/legal-documents"] as const;

export async function updatePageVisibilityAction(
  slot: string,
  visible: boolean,
): Promise<SettingActionResult> {
  return writeAppSetting(
    pageVisibilitySettingKey(slot),
    visible,
    VISIBILITY_PATHS,
  );
}

/**
 * Puts a legal document in force on the public site, or takes it back out
 * (#859).
 *
 * Not the same decision as page visibility, and deliberately a different
 * action: a hidden section is content held back, while a document in force is
 * an organization saying "this text is ours and it governs using our site".
 * The privacy policy is refused outright rather than silently ignored -- it is
 * served for every tenant, always, and a call asking to take it down is a bug
 * worth hearing about rather than a no-op to swallow.
 */
export async function updateLegalPublicationAction(
  key: string,
  inForce: boolean,
): Promise<SettingActionResult> {
  const document = legalDocument(key);
  if (!document) return { error: "That is not a legal document." };
  if (document.alwaysInForce) {
    return { error: `The ${document.label.toLowerCase()} is always served.` };
  }

  // A document a module depends on cannot be withdrawn while that module is on
  // (#1295), or the gate on the other side is one click from being empty: the
  // organization would be offering public accounts again with nothing
  // governing them. Refused here rather than in the database because this is
  // where the decision is made -- the same placement as the `alwaysInForce`
  // refusal above, and it leaves seeding, the demo reset and the e2e fixtures,
  // all of which write this row as `service_role`, free to set any state they
  // need to test.
  if (!inForce && document.gates.length > 0) {
    const supabase = await createSupabaseServerClient();
    const held = gatesHolding(document, await getTenantModules(supabase));
    if (held.length > 0) return { error: held[0].refuseWithdrawing };
  }

  return writeAppSetting(
    legalPublicationSettingKey(document.key),
    inForce,
    LEGAL_PATHS,
  );
}

/**
 * Records that somebody here has read the platform's text for a document this
 * organization serves (#1321).
 *
 * Not the same decision as putting a document in force, and deliberately a
 * third action rather than a flag on that one. Adopting the terms of use is a
 * decision about whether a document governs; this is a statement that a named
 * person read the words. The privacy policy has no adoption switch at all --
 * it is served for every tenant from the day it is provisioned, because the
 * forms are collecting from that day -- so for the one document where the
 * question matters most there is no other act to hang it on.
 *
 * What it writes is a record, not a permission: nothing here gates serving the
 * page, and #1321 is explicit that an unacknowledged default is a prompt and
 * never a 404. The policy must stay reachable while the forms collect.
 *
 * Both refusals below are the honest answer to a call that cannot mean
 * anything, rather than a no-op to swallow -- the same stance the
 * `alwaysInForce` refusal above takes. The panel offers the control in neither
 * state, so reaching either one is a bug worth hearing about.
 */
export async function acknowledgeLegalDocumentAction(
  key: string,
): Promise<SettingActionResult> {
  const document = legalDocument(key);
  if (!document) return { error: "That is not a legal document." };

  const supabase = await createSupabaseServerClient();
  // Checked here as well as inside `writeAppSetting`, unlike its neighbours,
  // because both refusals below describe this organization's own state. A
  // reader who reaches the Website section on `site_content:view` alone should
  // be told they cannot do this, not told what their tenant is serving and
  // then refused on the way out.
  const permissionError = await checkPermission(
    supabase,
    "system_settings",
    "manage",
  );
  if (permissionError) return permissionError;

  const [publication, ownDocuments] = await Promise.all([
    getTenantLegalPublication(supabase),
    getTenantOwnLegalDocuments(supabase),
  ]);

  if (!publication[document.key]) {
    return {
      error: `Your ${document.label.toLowerCase()} is not being served, so there is nothing to confirm yet.`,
    };
  }
  // Publishing your own text is the confirmation. There is no platform
  // document in the way to have gone unread.
  if (ownDocuments.has(document.slotKey)) {
    return {
      error: `Your site serves your own ${document.label.toLowerCase()}, not the platform's, so there is nothing of ours to confirm.`,
    };
  }

  // Captured from the session rather than accepted as an argument: this row's
  // whole value is that it names who read the text, and a Server Action's
  // arguments are whatever the caller sent.
  const person = await resolveCurrentPerson(supabase);

  return writeAppSetting(
    legalAcknowledgementSettingKey(document.key),
    {
      person_id: person?.id ?? null,
      person_name: personDisplayName(person, "") || null,
      acknowledged_at: new Date().toISOString(),
      // The version of the text that was read, which is what makes the record
      // go stale by itself when the platform edits the prose.
      platform_last_updated: PLATFORM_LEGAL_LAST_UPDATED,
    },
    LEGAL_PATHS,
  );
}

/**
 * How much of a section the public site shows (#846). Validated against the
 * slot's own options rather than trusted from the client: this is a Server
 * Action, so the argument is whatever the caller sent, and a value nobody
 * offered would reach the home page as a layout nobody designed.
 */
export async function updateLayoutSettingAction(
  slot: string,
  value: LayoutValue,
): Promise<SettingActionResult> {
  const registered = LAYOUT_SLOTS.find((candidate) => candidate.key === slot);
  if (!registered || !isLayoutValue(registered, value)) {
    return { error: "That isn't one of the options for this setting." };
  }

  return writeAppSetting(layoutSettingKey(slot), value, LAYOUT_PATHS);
}
