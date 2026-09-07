import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { GEAR_PHOTOS_BUCKET, gearPhotoPathFromUrl } from "./gear-photos";

/**
 * Sweeps gear-photo objects that no inventory item points at (#781).
 *
 * The field uploads on select rather than on save, so that a volunteer never
 * ends up with a saved donation whose photo was lost -- they hold
 * `inventory_intake:manage` and nothing else, and could not go back and repair
 * it. The price is that every abandoned intake, and every deleted item, leaves
 * an object behind. This is what collects them.
 *
 * Runs on the service-role client, which bypasses RLS, so it sees every
 * tenant's prefix. The Storage API rather than SQL on `storage.objects`:
 * deleting those rows would leave the bytes on disk on hosted Supabase, and the
 * `storage` schema is not exposed through PostgREST anyway.
 */

/** How long an object is left alone before it counts as abandoned. */
const DEFAULT_OLDER_THAN_HOURS = 24;

/** Storage caps a list page; delete calls are batched to the same size. */
const PAGE_SIZE = 100;

export type GearPhotoPurgeSummary = {
  /** Tenant prefixes examined. */
  tenants: number;
  /** Objects seen across every prefix. */
  scanned: number;
  /** Objects deleted. */
  deleted: number;
  /** Objects left because they are still referenced or not yet old enough. */
  kept: number;
};

type StorageObject = { name: string; created_at?: string | null };

async function listPrefix(
  supabase: SupabaseClient,
  prefix: string,
): Promise<StorageObject[]> {
  const objects: StorageObject[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase.storage
      .from(GEAR_PHOTOS_BUCKET)
      .list(prefix, { limit: PAGE_SIZE, offset });
    if (error) throw new Error(`Could not list ${prefix}: ${error.message}`);
    const page = (data ?? []) as StorageObject[];
    objects.push(...page);
    if (page.length < PAGE_SIZE) return objects;
  }
}

/**
 * Every object path currently referenced by an inventory item.
 *
 * Throws rather than returning an empty set on failure. An empty set means
 * "nothing is referenced", which to the caller below reads as "delete
 * everything" -- so a query that failed must stop the run, not shape it.
 */
async function livePaths(supabase: SupabaseClient): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("inventory_items")
    .select("photo_url")
    .like("photo_url", `%/${GEAR_PHOTOS_BUCKET}/%`);
  if (error) {
    throw new Error(`Could not read referenced photos: ${error.message}`);
  }

  const paths = new Set<string>();
  for (const row of (data ?? []) as { photo_url: string | null }[]) {
    // Matched on the object path, never the whole URL: the same object is
    // served from the local stack, the hosted project and any custom domain,
    // and treating an unfamiliar origin as unreferenced would delete live
    // photos wholesale.
    const path = gearPhotoPathFromUrl(row.photo_url);
    if (path) paths.add(path);
  }
  return paths;
}

async function removeAll(
  supabase: SupabaseClient,
  paths: string[],
): Promise<number> {
  let removed = 0;
  for (let at = 0; at < paths.length; at += PAGE_SIZE) {
    const batch = paths.slice(at, at + PAGE_SIZE);
    const { data, error } = await supabase.storage
      .from(GEAR_PHOTOS_BUCKET)
      .remove(batch);
    if (error) {
      throw new Error(`Could not remove gear photos: ${error.message}`);
    }
    removed += (data ?? []).length;
  }
  return removed;
}

export async function runGearPhotoPurge(
  supabase: SupabaseClient,
  options: { olderThanHours?: number } = {},
): Promise<GearPhotoPurgeSummary> {
  const olderThanHours = options.olderThanHours ?? DEFAULT_OLDER_THAN_HOURS;
  const cutoff = Date.now() - olderThanHours * 60 * 60 * 1000;

  // Read the live set first. If this throws, nothing has been deleted.
  const live = await livePaths(supabase);

  const { data: tenantRows, error: tenantError } = await supabase
    .from("tenants")
    .select("id");
  if (tenantError) {
    throw new Error(`Could not read tenants: ${tenantError.message}`);
  }
  const tenants = (tenantRows ?? []) as { id: string }[];

  const summary: GearPhotoPurgeSummary = {
    tenants: tenants.length,
    scanned: 0,
    deleted: 0,
    kept: 0,
  };

  for (const tenant of tenants) {
    const objects = await listPrefix(supabase, tenant.id);
    summary.scanned += objects.length;

    const orphaned: string[] = [];
    for (const object of objects) {
      const path = `${tenant.id}/${object.name}`;
      // The age window is load-bearing: an object uploaded a minute ago belongs
      // to a form still open on somebody's phone, and is not yet referenced by
      // anything.
      const createdAt = object.created_at
        ? Date.parse(object.created_at)
        : Number.NaN;
      const old = Number.isFinite(createdAt) && createdAt < cutoff;
      if (old && !live.has(path)) orphaned.push(path);
      else summary.kept += 1;
    }

    summary.deleted += await removeAll(supabase, orphaned);
  }

  return summary;
}

/**
 * Removes every gear photo belonging to one tenant.
 *
 * Neither `delete_tenant()` nor the export can reach Storage -- deleting
 * `storage.objects` rows in SQL leaves the bytes behind on hosted Supabase --
 * so tenant teardown has to call this separately, and must call it *before*
 * `delete_tenant()`: afterwards the tenant id is gone and there is nothing left
 * to derive the prefix from. See docs/tenants.md.
 */
export async function deleteTenantGearPhotos(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<{ deleted: number }> {
  const objects = await listPrefix(supabase, tenantId);
  const deleted = await removeAll(
    supabase,
    objects.map((object) => `${tenantId}/${object.name}`),
  );
  return { deleted };
}
