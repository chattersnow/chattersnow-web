import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ARTWORK_BUCKET } from "./artwork-submissions";

/**
 * Sweeps artwork objects that no submission row points at (#870).
 *
 * Abandonment is the normal case here, not the edge one: an artist picks three
 * files, the browser uploads them, and then they close the tab without filling
 * in their name. Those objects exist and nothing references them. So does
 * every image behind a submission a curator later deleted.
 *
 * Runs beside runGearPhotoPurge on the same daily cron rather than on one of
 * its own -- Vercel's Hobby plan allows a single cron a day, and two sweeps
 * that both need the service-role client have no reason to be separate jobs.
 *
 * The Storage API rather than SQL against `storage.objects`: deleting those
 * rows leaves the bytes on disk on hosted Supabase, and the `storage` schema
 * is not exposed through PostgREST anyway.
 */

/** How long an object is left alone before it counts as abandoned. */
const DEFAULT_OLDER_THAN_HOURS = 24;

/** Storage caps a list page; delete calls are batched to the same size. */
const PAGE_SIZE = 100;

export type ArtworkPurgeSummary = {
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
 * Every object under `prefix`, walking down into folders.
 *
 * Unlike the flat gear-photos bucket, paths here are four segments deep
 * (`{tenant}/{event}/{draft}/{image}`), and `.list()` only returns one level.
 * A folder comes back as an entry with a null `id`, which is how the two are
 * told apart.
 */
async function listTree(
  supabase: SupabaseClient,
  prefix: string,
): Promise<{ path: string; created_at?: string | null }[]> {
  const found: { path: string; created_at?: string | null }[] = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase.storage
      .from(ARTWORK_BUCKET)
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

/**
 * Every path currently referenced by a submission, originals and thumbnails.
 *
 * Throws rather than returning an empty set on failure: an empty set reads to
 * the caller as "delete everything", so a query that failed must stop the run
 * rather than shape it.
 */
async function livePaths(supabase: SupabaseClient): Promise<Set<string>> {
  const paths = new Set<string>();

  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("artwork_submission_images")
      .select("storage_path, thumb_path")
      .range(from, from + 999);
    if (error) {
      throw new Error(`Could not read referenced artwork: ${error.message}`);
    }
    const page = (data ?? []) as {
      storage_path: string;
      thumb_path: string;
    }[];
    for (const row of page) {
      paths.add(row.storage_path);
      paths.add(row.thumb_path);
    }
    if (page.length < 1000) return paths;
  }
}

export async function runArtworkPurge(
  supabase: SupabaseClient,
  options: { olderThanHours?: number } = {},
): Promise<ArtworkPurgeSummary> {
  const olderThanHours = options.olderThanHours ?? DEFAULT_OLDER_THAN_HOURS;
  const cutoff = Date.now() - olderThanHours * 60 * 60 * 1000;

  // Read the live set first. If this throws, nothing has been deleted.
  const live = await livePaths(supabase);

  const objects = await listTree(supabase, "");
  const summary: ArtworkPurgeSummary = {
    scanned: objects.length,
    deleted: 0,
    kept: 0,
  };

  const orphaned: string[] = [];
  for (const object of objects) {
    // The age window is load-bearing: an object uploaded a minute ago belongs
    // to a form somebody still has open, and is not yet referenced by
    // anything.
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
      .from(ARTWORK_BUCKET)
      .remove(batch);
    if (error) {
      throw new Error(`Could not remove artwork objects: ${error.message}`);
    }
    summary.deleted += (data ?? []).length;
  }

  return summary;
}
