"use server";

import { revalidatePath } from "next/cache";
import { checkPermission } from "@/lib/auth/permissions";
import {
  GIVEAWAY_RULES_ANSWERS,
  GIVEAWAY_RULES_SECTIONS,
  isOddsBasis,
  type OddsBasis,
} from "@/lib/giveaway-rules";
import { getGiveawayRulesState } from "@/lib/giveaway-rules-facts";
import {
  buildGiveawayRules,
  giveawayRulesGaps,
  type GiveawayRulesDocument,
  type GiveawayRulesGap,
  type GiveawayRulesOverrides,
} from "@/lib/giveaway-rules-template";
import { currentTenant, getTenantContext } from "@/lib/portal/tenants";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { publicGiveawayRulesPath } from "@/lib/giveaway-rules-path";

/**
 * The giveaway editor's half of official rules (#1322): assembling the
 * document, saving what has been rewritten for this promotion, and freezing a
 * version.
 *
 * Reading and publishing both build the document from the same three inputs
 * through the same function, so what the editor shows is what a publish would
 * freeze. The only difference between them is the effective date, which a
 * preview does not have yet.
 */

export type GiveawayRulesEditorState = {
  oddsBasis: OddsBasis;
  overrides: GiveawayRulesOverrides;
  /** The document as it would be published right now. */
  preview: GiveawayRulesDocument;
  /**
   * The template's own text per section, so a section that has been rewritten
   * can be compared with what it replaced and put back.
   */
  template: Record<string, string[]>;
  /** What stands between this promotion and a publish. Empty means ready. */
  gaps: GiveawayRulesGap[];
  /** Newest first. Empty means nothing is served publicly. */
  versions: { version: number; effective_at: string }[];
  /** Questions the organization has not answered yet, for the link out. */
  unanswered: { key: string; label: string }[];
  /** Where the published rules are served, once there are any. */
  publicPath: string;
};

export type GiveawayRulesActionResult =
  { error: string } | { success: true; version?: number };

async function loadEditorState(
  giveawayId: string,
): Promise<{ data: GiveawayRulesEditorState } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(supabase, "events", "view");
  if (permissionError) return permissionError;

  const state = await getGiveawayRulesState(supabase, giveawayId);
  if (!state) return { error: "Could not load this giveaway." };

  const tenant = currentTenant(await getTenantContext(supabase));
  const input = {
    org: { name: tenant?.name ?? "" },
    answers: state.answers,
    facts: state.facts,
    overrides: state.overrides,
  };

  // The same document with nothing rewritten, which is what "put this section
  // back" restores and what the editor shows beside an override.
  const untouched = buildGiveawayRules(
    { ...input, overrides: {} },
    new Date().toISOString(),
  );
  const template: Record<string, string[]> = {};
  for (const section of untouched.sections) {
    template[section.id] = section.paragraphs;
  }

  return {
    data: {
      oddsBasis: state.oddsBasis,
      overrides: state.overrides,
      preview: buildGiveawayRules(input, new Date().toISOString()),
      template,
      gaps: giveawayRulesGaps(input),
      versions: state.versions,
      unanswered: GIVEAWAY_RULES_ANSWERS.filter(
        (field) => !state.answers[field.key]?.length,
      ).map((field) => ({ key: field.key, label: field.label })),
      publicPath: publicGiveawayRulesPath(giveawayId),
    },
  };
}

export async function getGiveawayRulesAction(
  giveawayId: string,
): Promise<{ data: GiveawayRulesEditorState } | { error: string }> {
  return loadEditorState(giveawayId);
}

/**
 * Saves what has been chosen or rewritten for this promotion. Publishes
 * nothing: a saved override reaches the public site only at the next publish,
 * which is what keeps a live promotion's rules from changing under it while
 * somebody is still editing them.
 */
export async function saveGiveawayRulesAction(
  giveawayId: string,
  input: { oddsBasis: string; overrides: Record<string, string[]> },
): Promise<GiveawayRulesActionResult> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(supabase, "events", "manage");
  if (permissionError) return permissionError;

  if (!isOddsBasis(input.oddsBasis)) {
    return { error: "That is not a way of stating the odds." };
  }

  // Only ids the registry knows, and only non-blank paragraphs: a section
  // cleared in the editor is an absent key, which is "use the template" rather
  // than "publish nothing here".
  const overrides: GiveawayRulesOverrides = {};
  for (const section of GIVEAWAY_RULES_SECTIONS) {
    const paragraphs = (input.overrides[section.id] ?? [])
      .map((paragraph) => paragraph.trim())
      .filter(Boolean);
    if (paragraphs.length) overrides[section.id] = paragraphs;
  }

  const { error } = await supabase.from("giveaway_rules").upsert(
    {
      giveaway_id: giveawayId,
      odds_basis: input.oddsBasis,
      overrides,
    },
    { onConflict: "tenant_id,giveaway_id" },
  );
  if (error) {
    return { error: "Could not save these rules. Please try again." };
  }

  return { success: true };
}

/**
 * Freezes the rules as they stand.
 *
 * Refused while anything is missing, rather than published with a gap in it.
 * A set of official rules with no eligibility section is worse than none: the
 * promotion has no public rules page until somebody publishes, and an
 * organization that has answered nothing is exactly where #1322 says it should
 * be left -- serving nothing.
 */
export async function publishGiveawayRulesAction(
  giveawayId: string,
): Promise<GiveawayRulesActionResult> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(supabase, "events", "manage");
  if (permissionError) return permissionError;

  const state = await getGiveawayRulesState(supabase, giveawayId);
  if (!state) return { error: "Could not load this giveaway." };

  const tenant = currentTenant(await getTenantContext(supabase));
  const input = {
    org: { name: tenant?.name ?? "" },
    answers: state.answers,
    facts: state.facts,
    overrides: state.overrides,
  };

  const gaps = giveawayRulesGaps(input);
  if (gaps.length) {
    return {
      error: `These rules are not ready to publish: ${gaps
        .map((gap) => `${gap.sectionTitle} — ${gap.missing}`)
        .join(" ")}`,
    };
  }

  // The effective date is the database's, not this process's: it is what the
  // version row is stamped with and what the page prints.
  const document = buildGiveawayRules(input, new Date().toISOString());
  const { data, error } = await supabase.rpc("publish_giveaway_rules", {
    p_giveaway_id: giveawayId,
    p_content: document as unknown as never,
  });

  if (error) {
    return { error: "Could not publish these rules. Please try again." };
  }

  const published = (
    data as { version: number; effective_at: string }[] | null
  )?.[0];
  revalidatePath(publicGiveawayRulesPath(giveawayId));
  return { success: true, version: published?.version };
}
