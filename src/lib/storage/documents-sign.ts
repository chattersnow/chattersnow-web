import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DOCUMENTS_BUCKET } from "./documents";

/** An hour: long enough to read a board packet, short enough that a copied
 * URL is not a way to hand the document on. */
const SIGNED_URL_TTL_SECONDS = 60 * 60;

/**
 * A signed URL for every stored document path, in one round trip (#1489).
 *
 * On the caller's own client, never the service-role one: the bucket's select
 * policy is what decides whether a path resolves, so a reader without the
 * module's view grant gets nothing here rather than being trusted to have been
 * stopped upstream.
 *
 * A path that fails to sign is simply absent from the map. One missing object
 * must not blank a whole table, and the preview falls back to naming the file.
 */
export async function signDocumentPaths(
  supabase: SupabaseClient,
  paths: readonly (string | null | undefined)[],
): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter((path): path is string => !!path))];
  const urls = new Map<string, string>();
  if (unique.length === 0) return urls;

  const { data, error } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrls(unique, SIGNED_URL_TTL_SECONDS);
  if (error) {
    console.error("Could not sign document URLs", error);
    return urls;
  }
  for (const row of data ?? []) {
    if (row.path && row.signedUrl) urls.set(row.path, row.signedUrl);
  }
  return urls;
}

/**
 * Attaches `document_url` to each row that has a `document_path`, for a page
 * handing rows to a client table.
 */
export async function withDocumentUrls<
  T extends { document_path: string | null },
>(
  supabase: SupabaseClient,
  rows: T[],
): Promise<(T & { document_url: string | null })[]> {
  const urls = await signDocumentPaths(
    supabase,
    rows.map((row) => row.document_path),
  );
  return rows.map((row) => ({
    ...row,
    document_url: row.document_path
      ? (urls.get(row.document_path) ?? null)
      : null,
  }));
}
