"use server";

import { revalidatePath } from "next/cache";
import type { Json } from "@/lib/supabase/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/auth/permissions";
import { isValidPublicationSlug } from "@/lib/publications";
import {
  PUBLICATIONS_PATH,
  referencedPaths,
  type EditorPage,
  type IssueDetails,
} from "./publication-shared";

export type PublicationActionResult = { error: string } | { success: true };
export type CreatePublicationResult = { error: string } | { id: string };

export type NewIssueInput = {
  title: string;
  slug: string;
  seasonLabel: string;
  publishDate: string;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const PERMISSION_MESSAGE = "You don't have permission to edit publications.";

function detailsError(input: {
  title: string;
  slug: string;
  publishDate: string;
}): string | null {
  if (!input.title.trim()) return "An issue needs a title.";
  if (!isValidPublicationSlug(input.slug)) {
    return "The web address must be lowercase words joined by hyphens, like fall-2026.";
  }
  if (input.publishDate && !DATE_PATTERN.test(input.publishDate)) {
    return "The publish date is not a date.";
  }
  return null;
}

/**
 * The database's refusals, as sentences. The two guard triggers from
 * 20260929100000 carry their reason in `detail`, which is written for a
 * person already; the rest are constraint names.
 */
function databaseError(
  error: { code?: string; message?: string; details?: string },
  fallback: string,
): { error: string } {
  const message = error.message ?? "";
  if (error.code === "23505") {
    return { error: "Another issue already uses that web address." };
  }
  if (
    message.includes("PUBLICATION_SLUG_LOCKED") ||
    message.includes("PUBLICATION_INCOMPLETE") ||
    message.includes("PUBLICATION_NOT_FOUND")
  ) {
    return { error: error.details || fallback };
  }
  console.error("[publications]", error);
  return { error: fallback };
}

function revalidate(id?: string) {
  revalidatePath(PUBLICATIONS_PATH, "layout");
  // The public section reads through the definer views; a publish, an
  // unpublish or an edit to a published issue changes what it serves.
  revalidatePath("/publications", "layout");
  if (id) revalidatePath(`${PUBLICATIONS_PATH}/${id}`);
}

async function editorClient() {
  const supabase = await createSupabaseServerClient();
  const denied = await checkPermission(
    supabase,
    "publications",
    "manage",
    PERMISSION_MESSAGE,
  );
  return { supabase, denied };
}

/** Starts a draft issue. Pages, files and publishing happen in the editor. */
export async function createPublicationAction(
  input: NewIssueInput,
): Promise<CreatePublicationResult> {
  const invalid = detailsError(input);
  if (invalid) return { error: invalid };

  const { supabase, denied } = await editorClient();
  if (denied) return denied;

  const { data, error } = await supabase
    .from("publications")
    .insert({
      title: input.title.trim(),
      slug: input.slug,
      season_label: input.seasonLabel.trim() || null,
      publish_date: input.publishDate || null,
    })
    .select("id")
    .single();
  if (error || !data) {
    return databaseError(error ?? {}, "Could not create the issue.");
  }

  revalidate();
  return { id: data.id };
}

/**
 * Saves an issue's details and its whole ordered page list, through
 * `save_publication()`, in one transaction.
 *
 * Every path must sit under this tenant's folder for this issue. The bucket's
 * policies already confine what an editor can *upload*; this stops a row from
 * pointing at an object somebody else uploaded, which the table's own RLS has
 * no way to see.
 */
export async function savePublicationAction(
  id: string,
  details: IssueDetails,
  pages: readonly EditorPage[],
): Promise<PublicationActionResult> {
  const invalid = detailsError(details);
  if (invalid) return { error: invalid };

  const { supabase, denied } = await editorClient();
  if (denied) return denied;

  const { data: tenantId } = await supabase.rpc("current_tenant_id");
  if (!tenantId) return { error: "Choose an organization first." };

  const folder = `${tenantId}/${id}/`;
  if (!referencedPaths(details, pages).every((p) => p.startsWith(folder))) {
    return { error: "A file on this issue belongs to another one." };
  }

  const issue = {
    slug: details.slug,
    title: details.title.trim(),
    season_label: details.seasonLabel,
    publish_date: details.publishDate,
    blurb: details.blurb,
    cover_path: details.cover?.path ?? null,
    cover_width: details.cover?.width ?? null,
    cover_height: details.cover?.height ?? null,
    cover_renditions: details.cover?.renditions ?? [],
    reading_pdf_path: details.readingPdf?.path ?? null,
    reading_pdf_bytes: details.readingPdf?.bytes ?? null,
    print_pdf_path: details.printPdf?.path ?? null,
    print_pdf_bytes: details.printPdf?.bytes ?? null,
  };

  const { error } = await supabase.rpc("save_publication", {
    p_id: id,
    p_issue: issue as Json,
    p_pages: pages.map((page) => ({
      id: page.id ?? null,
      image_path: page.image.path,
      width: page.image.width,
      height: page.image.height,
      image_renditions: page.image.renditions,
      alt_text: page.altText,
      transcript: page.transcript,
    })) as Json,
  });
  if (error) return databaseError(error, "Could not save the issue.");

  revalidate(id);
  return { success: true };
}

/**
 * Publishes or unpublishes. The guard trigger is what refuses an issue with a
 * page missing its text, and what freezes the slug on the first publish.
 */
export async function setPublicationStatusAction(
  id: string,
  status: "draft" | "published",
): Promise<PublicationActionResult> {
  const { supabase, denied } = await editorClient();
  if (denied) return denied;

  const { data, error } = await supabase
    .from("publications")
    .update({ status })
    .eq("id", id)
    .select("id");
  if (error) {
    return databaseError(
      error,
      status === "published"
        ? "Could not publish the issue."
        : "Could not unpublish the issue.",
    );
  }
  if (!data?.length) return { error: "That issue no longer exists." };

  revalidate(id);
  return { success: true };
}

/**
 * Deletes an issue and its pages. The files go with the daily orphan purge,
 * once nothing points at them.
 */
export async function deletePublicationAction(
  id: string,
): Promise<PublicationActionResult> {
  const { supabase, denied } = await editorClient();
  if (denied) return denied;

  const { error } = await supabase.from("publications").delete().eq("id", id);
  if (error) return databaseError(error, "Could not delete the issue.");

  revalidate();
  return { success: true };
}
