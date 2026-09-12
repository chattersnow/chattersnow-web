import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getTenantLexicon } from "@/lib/tenant-lexicon";
import {
  DEFAULT_PERSON_ROLE_LABELS,
  DEFAULT_VOCABULARY,
  PERSON_ROLE_LABELS_SETTING_KEY,
  personRoleLabelsFromValue,
  storedPersonRoleLabels,
  withPersonRoleTerms,
  type PersonRoleKey,
  type PersonRoleLabel,
  type PersonRoleLabels,
} from "@/lib/person-roles";
import type { Lexicon } from "@/lib/lexicon";

/**
 * What the current tenant calls the six person roles (#911).
 *
 * Read through `tenant_person_role_labels` rather than from `app_settings`
 * directly, for the reason the lexicon and the brand tokens are: that table's
 * select policy requires one of six `manage` permissions, and the audience for
 * these words is anyone holding `people:view`. The definer view hands out the
 * one key instead of widening that OR-chain.
 *
 * Cached per request because the layout, the directory, a segment page's
 * metadata and every aspect card read it in one pass.
 */
export const getTenantPersonRoleLabels = cache(
  async (supabase: SupabaseClient): Promise<PersonRoleLabels> => {
    const { data, error } = await supabase
      .from("tenant_person_role_labels")
      .select("labels")
      .maybeSingle();
    if (error) {
      console.error(
        "[person-roles] could not read tenant_person_role_labels; the portal is using the platform's own words",
        error,
      );
      return DEFAULT_PERSON_ROLE_LABELS;
    }
    return personRoleLabelsFromValue(data?.labels);
  },
);

/**
 * Everything a `{term}` template in the portal can name: the lexicon's words
 * for what this organization lends, plus its words for the people it works
 * with.
 *
 * One read for callers that render templates -- the portal shell, the people
 * directory, the aspect cards -- so no surface has to know which setting a word
 * came from. Both halves are request-cached, so calling this from four cards on
 * one page costs one round trip each.
 */
export const getPortalVocabulary = cache(
  async (supabase: SupabaseClient): Promise<Lexicon> => {
    const [lexicon, roleLabels] = await Promise.all([
      getTenantLexicon(supabase),
      getTenantPersonRoleLabels(supabase),
    ]);
    return withPersonRoleTerms(lexicon, roleLabels);
  },
);

/** The platform's own words, for a surface with no tenant behind it. */
export { DEFAULT_VOCABULARY };

/**
 * Only the words this tenant has set, unresolved, for the Administration panel.
 *
 * Straight from `app_settings` rather than through the view: RLS scopes the
 * table to the tenant being edited where the view answers for
 * `current_tenant_id()`, and the panel has to read the row it is about to
 * write. The same split `getStoredLexicon` makes.
 */
export async function getStoredPersonRoleLabels(
  supabase: SupabaseClient,
): Promise<Partial<Record<PersonRoleKey, Partial<PersonRoleLabel>>>> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", PERSON_ROLE_LABELS_SETTING_KEY)
    .maybeSingle();

  if (error) {
    console.error(
      "[person-roles] could not read people.role_labels from app_settings; the panel is showing empty fields",
      error,
    );
    return {};
  }
  return storedPersonRoleLabels(data?.value);
}
