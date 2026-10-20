import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SITE_PHOTOS_BUCKET, sitePhotoPathFromUrl } from "./site-photos";

/**
 * Sweeps site-photo objects that nothing points at (#1492).
 *
 * Every writer to this bucket uploads the moment a file is picked, not when
 * the form is saved, so a discarded draft, a photo replaced by another upload
 * or by a link, a cleared slot, and a publish that reverts a slot to its
 * registry default all leave an object behind. `deleteSitePhoto()` only
 * removes what the current editing session uploaded, and only for someone
 * holding site_content:manage -- the People, Events and branding writers
 * cannot delete at all (20261009180000, 20261009220000). This is what
 * collects the rest, on the same daily cron as the other sweeps and on the
 * same terms as `orphan-purge.ts`: the Storage API rather than SQL on
 * `storage.objects`, the live set read before anything is listed, and a
 * failure to read it throwing rather than reading as "nothing is referenced".
 *
 * Accepted: audit-log rows keep the URLs they recorded, so restoring an old
 * value from the audit log after the sweep has run can point at a deleted
 * object -- as it already can for gear photos.
 */

/**
 * Every place a site-photo URL can be stored. A module that starts writing to
 * this bucket adds its column here, or the sweep deletes its pictures a day
 * after they are saved.
 *
 * - `url`: a text column holding one URL, maybe with a `#crop=` fragment.
 * - `json`: a jsonb column scanned whole, because list slots keep photo URLs
 *   nested inside their rows and rich text can carry one mid-sentence.
 *
 * Columns are listed even where the UI only offers a link box, because a
 * user can paste a site-photos URL into any of them.
 */
export const SITE_PHOTO_REFERENCES = [
  // A photo that is only in an unpublished draft is still live.
  { table: "site_content", column: "value", kind: "json" },
  { table: "site_content", column: "draft_value", kind: "json" },
  // Branding logo and app icon, `brand.logo_url` and `brand.app_icon_url`
  // (#1488). Every setting is scanned rather than those two keys, so a new
  // branding picture is covered without an edit here.
  { table: "app_settings", column: "value", kind: "json" },
  { table: "public_team_members", column: "photo_url", kind: "url" }, // #1486
  { table: "events", column: "flier_url", kind: "url" }, // #1487
  { table: "people", column: "logo_url", kind: "url" }, // #1488
] as const satisfies readonly {
  table: string;
  column: string;
  kind: "url" | "json";
}[];

/** How long an object is left alone before it counts as abandoned. */
const DEFAULT_OLDER_THAN_HOURS = 24;

/** Storage caps a list page; delete calls are batched to the same size. */
const PAGE_SIZE = 100;

/** PostgREST's default row cap. */
const ROW_PAGE = 1000;

/** An absolute URL inside a longer string; stops at quotes, brackets and space. */
const URL_PATTERN = /https?:\/\/[^\s"'<>()[\]]+/g;

export type SitePhotoPurgeSummary = {
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

/**
 * Every site-photo object path anywhere inside `value`: a string, or a jsonb
 * value of any depth. Each URL goes through `sitePhotoPathFromUrl()`, so it is
 * matched on the object path whatever the origin, and a `#crop=` fragment is
 * dropped.
 */
export function sitePhotoPathsIn(value: unknown): string[] {
  const paths: string[] = [];
  const visit = (node: unknown) => {
    if (typeof node === "string") {
      for (const match of node.matchAll(URL_PATTERN)) {
        const path = sitePhotoPathFromUrl(match[0]);
        if (path) paths.push(path);
      }
    } else if (Array.isArray(node)) {
      node.forEach(visit);
    } else if (node && typeof node === "object") {
      Object.values(node).forEach(visit);
    }
  };
  visit(value);
  return paths;
}

/**
 * Every object path currently referenced, across every tenant, since this
 * runs on the service-role client.
 *
 * Throws rather than returning a partial set on failure. A missing source
 * means "nothing there is referenced", which to the caller below reads as
 * "delete it" -- so a query that failed must stop the run, not shape it.
 */
export async function liveSitePhotoPaths(
  supabase: SupabaseClient,
): Promise<Set<string>> {
  const paths = new Set<string>();
  for (const { table, column, kind } of SITE_PHOTO_REFERENCES) {
    for (let from = 0; ; from += ROW_PAGE) {
      let query = supabase
        .from(table)
        .select(`id, ${column}`)
        .not(column, "is", null);
      if (kind === "url") {
        query = query.like(column, `%/${SITE_PHOTOS_BUCKET}/%`);
      }
      const { data, error } = await query
        .order("id")
        .range(from, from + ROW_PAGE - 1);
      if (error) {
        throw new Error(`Could not read ${table}.${column}: ${error.message}`);
      }
      const page = (data ?? []) as unknown as Record<string, unknown>[];
      for (const row of page) {
        for (const path of sitePhotoPathsIn(row[column])) paths.add(path);
      }
      if (page.length < ROW_PAGE) break;
    }
  }
  return paths;
}

async function listPrefix(
  supabase: SupabaseClient,
  prefix: string,
): Promise<StorageObject[]> {
  const objects: StorageObject[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase.storage
      .from(SITE_PHOTOS_BUCKET)
      .list(prefix, { limit: PAGE_SIZE, offset });
    if (error) throw new Error(`Could not list ${prefix}: ${error.message}`);
    const page = (data ?? []) as StorageObject[];
    objects.push(...page);
    if (page.length < PAGE_SIZE) return objects;
  }
}

async function removeAll(
  supabase: SupabaseClient,
  paths: string[],
): Promise<number> {
  let removed = 0;
  for (let at = 0; at < paths.length; at += PAGE_SIZE) {
    const { data, error } = await supabase.storage
      .from(SITE_PHOTOS_BUCKET)
      .remove(paths.slice(at, at + PAGE_SIZE));
    if (error) {
      throw new Error(`Could not remove site photos: ${error.message}`);
    }
    removed += (data ?? []).length;
  }
  return removed;
}

export async function runSitePhotoPurge(
  supabase: SupabaseClient,
  options: { olderThanHours?: number } = {},
): Promise<SitePhotoPurgeSummary> {
  const olderThanHours = options.olderThanHours ?? DEFAULT_OLDER_THAN_HOURS;
  const cutoff = Date.now() - olderThanHours * 60 * 60 * 1000;

  // Read the live set first. If this throws, nothing has been deleted.
  const live = await liveSitePhotoPaths(supabase);

  const { data: tenantRows, error: tenantError } = await supabase
    .from("tenants")
    .select("id");
  if (tenantError) {
    throw new Error(`Could not read tenants: ${tenantError.message}`);
  }
  const tenants = (tenantRows ?? []) as { id: string }[];

  const summary: SitePhotoPurgeSummary = {
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
      // The age window is load-bearing: a photo picked a minute ago belongs
      // to an editor who has not saved or published yet.
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
