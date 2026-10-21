import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { EVENT_MEDIA_BUCKET } from "./event-media-files";

/**
 * The event-media bucket's daily sweep (#1608), two jobs in one pass:
 *
 * 1. Orphans. A file is uploaded to a signed slot first and recorded after,
 *    so an upload abandoned mid-batch, a tab closed before the record call,
 *    or a record call that failed leaves an object with no `event_media` row
 *    -- invisible in the gallery, and so impossible to delete from it. Same
 *    terms as the other sweeps on this cron: the Storage API rather than SQL
 *    on `storage.objects`, the live set read before anything is listed, a
 *    failure to read it throwing rather than reading as "nothing is
 *    referenced", and nothing younger than a day touched -- a long video is
 *    still being recorded against its slot.
 * 2. Expired media, for tenants that have set a retention period. Which files
 *    those are is `expired_event_media()`'s call, so the rule lives in one
 *    place with the Media card's dates. A tenant without a period has none.
 *    The object goes before its row, as in `deleteEventMediaAction`: a row
 *    whose delete failed is still found by the next run.
 */

/** How long an object is left alone before it counts as abandoned. */
const DEFAULT_OLDER_THAN_HOURS = 24;

/** Storage caps a list page; delete calls are batched to the same size. */
const PAGE_SIZE = 100;

/** PostgREST's default row cap. */
const ROW_PAGE = 1000;

export type EventMediaPurgeSummary = {
  /** Objects seen across the bucket. */
  scanned: number;
  /** Objects with no row, deleted. */
  orphansDeleted: number;
  /** Photos and videos past their retention date, deleted with their rows. */
  expiredDeleted: number;
  /** Objects left because they have a row or are not yet old enough. */
  kept: number;
};

type StorageObject = {
  name: string;
  id?: string | null;
  created_at?: string | null;
};

/**
 * Every object under `prefix`, walking down into folders: paths are
 * `{tenant}/{event}/{file}` and `.list()` returns one level. A folder comes
 * back with a null `id`.
 */
async function listTree(
  supabase: SupabaseClient,
  prefix: string,
): Promise<{ path: string; created_at?: string | null }[]> {
  const found: { path: string; created_at?: string | null }[] = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase.storage
      .from(EVENT_MEDIA_BUCKET)
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

/** Every recorded path, across every tenant, since this runs on the service-role client. */
export async function liveEventMediaPaths(
  supabase: SupabaseClient,
): Promise<Set<string>> {
  const paths = new Set<string>();
  for (let from = 0; ; from += ROW_PAGE) {
    const { data, error } = await supabase
      .from("event_media")
      .select("id, storage_path, thumb_path")
      .order("id")
      .range(from, from + ROW_PAGE - 1);
    if (error) throw new Error(`Could not read event_media: ${error.message}`);
    const page = (data ?? []) as {
      storage_path: string;
      thumb_path: string | null;
    }[];
    for (const row of page) {
      paths.add(row.storage_path);
      // An original photo's thumbnail (#1620) is as live as the photo.
      if (row.thumb_path) paths.add(row.thumb_path);
    }
    if (page.length < ROW_PAGE) return paths;
  }
}

async function removeAll(
  supabase: SupabaseClient,
  paths: string[],
): Promise<number> {
  let removed = 0;
  for (let at = 0; at < paths.length; at += PAGE_SIZE) {
    const { data, error } = await supabase.storage
      .from(EVENT_MEDIA_BUCKET)
      .remove(paths.slice(at, at + PAGE_SIZE));
    if (error)
      throw new Error(`Could not remove event media: ${error.message}`);
    removed += (data ?? []).length;
  }
  return removed;
}

/**
 * Deletes what `expired_event_media()` returns: objects, then rows. Counts
 * rows, since an object already gone (a delete that half-finished) still
 * leaves a row to clear.
 */
async function purgeExpired(
  supabase: SupabaseClient,
  now: Date,
): Promise<number> {
  const { data, error } = await supabase.rpc("expired_event_media", {
    p_now: now.toISOString(),
  });
  if (error) {
    throw new Error(`Could not read expired event media: ${error.message}`);
  }
  const expired = (data ?? []) as {
    id: string;
    storage_path: string;
    thumb_path: string | null;
  }[];

  let deleted = 0;
  for (let at = 0; at < expired.length; at += PAGE_SIZE) {
    const batch = expired.slice(at, at + PAGE_SIZE);
    await removeAll(
      supabase,
      batch.flatMap((row) =>
        row.thumb_path
          ? [row.storage_path, row.thumb_path]
          : [row.storage_path],
      ),
    );
    const { data: rows, error: deleteError } = await supabase
      .from("event_media")
      .delete()
      .in(
        "id",
        batch.map((row) => row.id),
      )
      .select("id");
    if (deleteError) {
      throw new Error(
        `Could not delete expired event media rows: ${deleteError.message}`,
      );
    }
    deleted += (rows ?? []).length;
  }
  return deleted;
}

export async function runEventMediaPurge(
  supabase: SupabaseClient,
  options: { olderThanHours?: number; now?: Date } = {},
): Promise<EventMediaPurgeSummary> {
  const now = options.now ?? new Date();
  const olderThanHours = options.olderThanHours ?? DEFAULT_OLDER_THAN_HOURS;
  const cutoff = now.getTime() - olderThanHours * 60 * 60 * 1000;

  // Read the live set first. If this throws, nothing has been deleted.
  const live = await liveEventMediaPaths(supabase);

  const objects = await listTree(supabase, "");
  const summary: EventMediaPurgeSummary = {
    scanned: objects.length,
    orphansDeleted: 0,
    expiredDeleted: 0,
    kept: 0,
  };

  const orphaned: string[] = [];
  for (const object of objects) {
    const createdAt = object.created_at
      ? Date.parse(object.created_at)
      : Number.NaN;
    const old = Number.isFinite(createdAt) && createdAt < cutoff;
    if (old && !live.has(object.path)) orphaned.push(object.path);
    else summary.kept += 1;
  }
  summary.orphansDeleted = await removeAll(supabase, orphaned);

  summary.expiredDeleted = await purgeExpired(supabase, now);
  return summary;
}
