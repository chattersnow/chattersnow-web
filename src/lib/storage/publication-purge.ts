import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PUBLICATION_FILES_BUCKET, parseRenditions } from "@/lib/publications";

/**
 * Sweeps publication files that no issue or page points at (#1472).
 *
 * The editor uploads the moment a file is picked and writes the rows only on
 * Save, so a page added and then removed, a replaced cover or PDF, an editor
 * who closed the tab, and every file of a deleted issue all leave objects
 * behind. This collects them, beside the gear-photo and artwork sweeps on the
 * same daily cron.
 *
 * The same shape as `artwork-purge.ts`: the Storage API rather than SQL on
 * `storage.objects` (deleting those rows leaves the bytes on hosted Supabase),
 * the live set read before anything is listed, and a failure to read it
 * throwing rather than reading as "nothing is referenced".
 */

/** How long an object is left alone before it counts as abandoned. */
const DEFAULT_OLDER_THAN_HOURS = 24;

/** Storage caps a list page; delete calls are batched to the same size. */
const PAGE_SIZE = 100;

/** PostgREST's default row cap. */
const ROW_PAGE = 1000;

export type PublicationPurgeSummary = {
  scanned: number;
  deleted: number;
  kept: number;
};

type StorageObject = {
  name: string;
  id?: string | null;
  created_at?: string | null;
};

/**
 * Every object under `prefix`, walking down into folders: paths are
 * `{tenant}/{publication}/{file}` and `.list()` returns one level. A folder
 * comes back with a null `id`.
 */
async function listTree(
  supabase: SupabaseClient,
  prefix: string,
): Promise<{ path: string; created_at?: string | null }[]> {
  const found: { path: string; created_at?: string | null }[] = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase.storage
      .from(PUBLICATION_FILES_BUCKET)
      .list(prefix, { limit: PAGE_SIZE, offset });
    if (error) throw new Error(`Could not list ${prefix}: ${error.message}`);

    const page = (data ?? []) as StorageObject[];
    for (const entry of page) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id) found.push({ path, created_at: entry.created_at });
      else found.push(...(await listTree(supabase, path)));
    }
    if (page.length < PAGE_SIZE) return found;
  }
}

async function readAll<T>(
  supabase: SupabaseClient,
  table: string,
  columns: string,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += ROW_PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order("id")
      .range(from, from + ROW_PAGE - 1);
    if (error) {
      throw new Error(`Could not read ${table}: ${error.message}`);
    }
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < ROW_PAGE) return rows;
  }
}

/**
 * Every path an issue or a page currently references: covers, pages, each
 * one's stored widths, and both PDFs. Every tenant's, since this runs on the
 * service-role client.
 */
export async function livePublicationPaths(
  supabase: SupabaseClient,
): Promise<Set<string>> {
  const paths = new Set<string>();
  const add = (path: string | null) => {
    if (path) paths.add(path);
  };

  const issues = await readAll<{
    cover_path: string | null;
    cover_renditions: unknown;
    reading_pdf_path: string | null;
    print_pdf_path: string | null;
  }>(
    supabase,
    "publications",
    "cover_path, cover_renditions, reading_pdf_path, print_pdf_path",
  );
  for (const issue of issues) {
    add(issue.cover_path);
    for (const r of parseRenditions(issue.cover_renditions)) add(r.path);
    add(issue.reading_pdf_path);
    add(issue.print_pdf_path);
  }

  const pages = await readAll<{
    image_path: string;
    image_renditions: unknown;
  }>(supabase, "publication_pages", "image_path, image_renditions");
  for (const page of pages) {
    add(page.image_path);
    for (const r of parseRenditions(page.image_renditions)) add(r.path);
  }

  return paths;
}

export async function runPublicationPurge(
  supabase: SupabaseClient,
  options: { olderThanHours?: number } = {},
): Promise<PublicationPurgeSummary> {
  const olderThanHours = options.olderThanHours ?? DEFAULT_OLDER_THAN_HOURS;
  const cutoff = Date.now() - olderThanHours * 60 * 60 * 1000;

  // Read the live set first. If this throws, nothing has been deleted.
  const live = await livePublicationPaths(supabase);

  const objects = await listTree(supabase, "");
  const summary: PublicationPurgeSummary = {
    scanned: objects.length,
    deleted: 0,
    kept: 0,
  };

  const orphaned: string[] = [];
  for (const object of objects) {
    // The age window is load-bearing: a file picked a minute ago belongs to
    // an editor who has not pressed Save yet.
    const createdAt = object.created_at
      ? Date.parse(object.created_at)
      : Number.NaN;
    const old = Number.isFinite(createdAt) && createdAt < cutoff;
    if (old && !live.has(object.path)) orphaned.push(object.path);
    else summary.kept += 1;
  }

  for (let at = 0; at < orphaned.length; at += PAGE_SIZE) {
    const batch = orphaned.slice(at, at + PAGE_SIZE);
    const { data, error } = await supabase.storage
      .from(PUBLICATION_FILES_BUCKET)
      .remove(batch);
    if (error) {
      throw new Error(`Could not remove publication files: ${error.message}`);
    }
    summary.deleted += (data ?? []).length;
  }

  return summary;
}
