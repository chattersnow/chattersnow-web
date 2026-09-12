"use server";

import { pageVisibilitySettingKey } from "@/lib/page-visibility";
import {
  legalDocument,
  legalPublicationSettingKey,
} from "@/lib/legal-documents";
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

  return writeAppSetting(
    legalPublicationSettingKey(document.key),
    inForce,
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
