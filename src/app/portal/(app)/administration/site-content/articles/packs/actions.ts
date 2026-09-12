"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/auth/permissions";
import {
  isValidContentPackKey,
  toAdoptionSummary,
  takenSlugsFromError,
  type AdoptionSummary,
} from "@/lib/content-packs";

export type PackActionResult = { error: string } | { success: true };
export type AdoptResult = { error: string } | AdoptionSummary;

const ARTICLES_PATH = "/portal/administration/site-content/articles";
const PACKS_PATH = "/portal/administration/site-content/articles/packs";

/**
 * Copies an offered pack into this tenant as drafts (#895).
 *
 * Gated on `site_content:manage` -- publishing the copies is what puts words on
 * the public site, and this is the permission that already decides who may do
 * that. Nothing here publishes anything: the copies land as drafts so somebody
 * at the organization reads them before they appear under its brand.
 */
export async function adoptContentPackAction(
  packId: string,
): Promise<AdoptResult> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "site_content",
    "manage",
  );
  if (permissionError) return permissionError;

  const { data, error } = await supabase.rpc("adopt_content_pack", {
    p_pack_id: packId,
  });

  if (error) {
    // The one failure worth spelling out: a category's address is identity, so
    // the copy refuses rather than renaming around a collision, and the editor
    // needs to know which pages to rename before trying again.
    const taken = takenSlugsFromError(error.message ?? "");
    if (taken) {
      return {
        error: `This tenant already has ${taken.length === 1 ? "a category" : "categories"} at ${taken
          .map((slug) => `/learn/${slug}`)
          .join(
            ", ",
          )}. Rename or remove ${taken.length === 1 ? "it" : "them"} and adopt again.`,
      };
    }
    return { error: "Could not adopt this pack. Please try again." };
  }

  const summary = toAdoptionSummary(data);
  if (!summary)
    return { error: "Could not adopt this pack. Please try again." };

  // Drafts only, so the public site is untouched and nothing there needs
  // revalidating -- the same stance saveArticleDraftsAction takes.
  revalidatePath(ARTICLES_PATH, "layout");
  return summary;
}

export type SaveContentPackInput = {
  /** Absent when creating. */
  id?: string;
  key: string;
  name: string;
  description: string;
  isOffered: boolean;
};

/**
 * Creates or edits a pack in the platform tenant.
 *
 * `platform_tenants:manage` is the gate, and `my_permissions()` reports that
 * resource as `none` unless `is_platform_operator()` holds -- so this one check
 * carries all three of its conditions. The RPC re-checks them regardless.
 */
export async function saveContentPackAction(
  input: SaveContentPackInput,
): Promise<{ error: string } | { id: string }> {
  const name = input.name.trim();
  const key = input.key.trim().toLowerCase();
  if (!name) return { error: "A pack needs a name." };
  if (!isValidContentPackKey(key)) {
    return {
      error:
        "A pack's key must be lowercase words joined by hyphens, like snow-sports-basics.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "platform_tenants",
    "manage",
  );
  if (permissionError) return permissionError;

  const { data, error } = await supabase.rpc("save_content_pack", {
    p_id: input.id ?? null,
    p_key: key,
    p_name: name,
    p_description: input.description.trim(),
    p_is_offered: input.isOffered,
  });
  if (error || typeof data !== "string") {
    return { error: "Could not save this pack. Please try again." };
  }

  revalidatePath(PACKS_PATH, "layout");
  return { id: data };
}

/**
 * Removes a pack. Its categories survive and simply stop belonging to it, and
 * tenants that already adopted it keep their copies -- which never referenced
 * it in the first place.
 */
export async function deleteContentPackAction(
  id: string,
): Promise<PackActionResult> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "platform_tenants",
    "manage",
  );
  if (permissionError) return permissionError;

  const { error } = await supabase.rpc("delete_content_pack", { p_id: id });
  if (error) return { error: "Could not remove this pack. Please try again." };

  revalidatePath(PACKS_PATH, "layout");
  return { success: true };
}

/** Adds a category to a pack, or takes it out when `packId` is null. */
export async function setArticleCategoryPackAction(
  categoryId: string,
  packId: string | null,
): Promise<PackActionResult> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "platform_tenants",
    "manage",
  );
  if (permissionError) return permissionError;

  const { error } = await supabase.rpc("set_article_category_pack", {
    p_category_id: categoryId,
    p_pack_id: packId,
  });
  if (error) {
    return { error: "Could not change what this pack holds. Try again." };
  }

  revalidatePath(PACKS_PATH, "layout");
  return { success: true };
}
