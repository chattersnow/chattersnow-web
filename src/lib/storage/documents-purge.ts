import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DOCUMENTS_BUCKET } from "./documents";

/**
 * Sweeps document objects that no record points at (#1489).
 *
 * `DocumentField` uploads the moment a file is picked and the record is only
 * written on Save, so a replaced or removed file, a form closed without saving
 * and every document of a deleted record leave objects behind. This collects
 * them on the same daily cron as the gear-photo, artwork and publication
 * sweeps, and on the same terms as `publication-purge.ts`: the Storage API
 * rather than SQL on `storage.objects`, the live set read before anything is
 * listed, and a failure to read it throwing rather than reading as "nothing is
 * referenced".
 */

/**
 * Every table with a `document_path` column. A module that starts storing
 * documents (#1490's receipts) adds its tables here, or the sweep deletes its
 * files a day after they are saved.
 */
export const DOCUMENT_TABLES = [
  "bylaws",
  "policies",
  "resolutions",
  "conflict_of_interest_disclosures",
  "annual_requirements",
  "agendas",
] as const;

/** How long an object is left alone before it counts as abandoned. */
const DEFAULT_OLDER_THAN_HOURS = 24;

/** Storage caps a list page; delete calls are batched to the same size. */
const PAGE_SIZE = 100;

/** PostgREST's default row cap. */
const ROW_PAGE = 1000;

export type DocumentPurgeSummary = {
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
 * `{tenant}/{module}/{upload}/{file}` and `.list()` returns one level. A
 * folder comes back with a null `id`.
 */
async function listTree(
  supabase: SupabaseClient,
  prefix: string,
): Promise<{ path: string; created_at?: string | null }[]> {
  const found: { path: string; created_at?: string | null }[] = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase.storage
      .from(DOCUMENTS_BUCKET)
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

/** Every path a record currently references, across every tenant. */
export async function liveDocumentPaths(
  supabase: SupabaseClient,
): Promise<Set<string>> {
  const paths = new Set<string>();
  for (const table of DOCUMENT_TABLES) {
    for (let from = 0; ; from += ROW_PAGE) {
      const { data, error } = await supabase
        .from(table)
        .select("id, document_path")
        .not("document_path", "is", null)
        .order("id")
        .range(from, from + ROW_PAGE - 1);
      if (error) throw new Error(`Could not read ${table}: ${error.message}`);
      const page = (data ?? []) as { document_path: string | null }[];
      for (const row of page) {
        if (row.document_path) paths.add(row.document_path);
      }
      if (page.length < ROW_PAGE) break;
    }
  }
  return paths;
}

async function removeAll(
  supabase: SupabaseClient,
  paths: string[],
): Promise<number> {
  let removed = 0;
  for (let at = 0; at < paths.length; at += PAGE_SIZE) {
    const { data, error } = await supabase.storage
      .from(DOCUMENTS_BUCKET)
      .remove(paths.slice(at, at + PAGE_SIZE));
    if (error) throw new Error(`Could not remove documents: ${error.message}`);
    removed += (data ?? []).length;
  }
  return removed;
}

export async function runDocumentPurge(
  supabase: SupabaseClient,
  options: { olderThanHours?: number } = {},
): Promise<DocumentPurgeSummary> {
  const olderThanHours = options.olderThanHours ?? DEFAULT_OLDER_THAN_HOURS;
  const cutoff = Date.now() - olderThanHours * 60 * 60 * 1000;

  // Read the live set first. If this throws, nothing has been deleted.
  const live = await liveDocumentPaths(supabase);

  const objects = await listTree(supabase, "");
  const summary: DocumentPurgeSummary = {
    scanned: objects.length,
    deleted: 0,
    kept: 0,
  };

  const orphaned: string[] = [];
  for (const object of objects) {
    // The age window is load-bearing: a file picked a minute ago belongs to
    // somebody who has not pressed Save yet.
    const createdAt = object.created_at
      ? Date.parse(object.created_at)
      : Number.NaN;
    const old = Number.isFinite(createdAt) && createdAt < cutoff;
    if (old && !live.has(object.path)) orphaned.push(object.path);
    else summary.kept += 1;
  }

  summary.deleted = await removeAll(supabase, orphaned);
  return summary;
}

/**
 * Removes every document belonging to one tenant. Call it *before*
 * `delete_tenant()`, like `deleteTenantGearPhotos` -- see docs/tenants.md.
 */
export async function deleteTenantDocuments(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<{ deleted: number }> {
  const objects = await listTree(supabase, tenantId);
  const deleted = await removeAll(
    supabase,
    objects.map((object) => object.path),
  );
  return { deleted };
}
