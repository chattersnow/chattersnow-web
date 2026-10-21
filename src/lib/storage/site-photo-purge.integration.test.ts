// Integration coverage for the site-photos orphan sweep (#1492), against a
// real local Supabase stack: real `site_content` rows, real objects, and the
// Storage API's own `created_at`.
//
// The unit tests prove the decision; this proves the sweep reads the columns
// it names and that PostgREST hands jsonb back in the shape it scans. A
// renamed column, or a list slot stored somewhere the scan doesn't reach,
// passes every mock and deletes live photos in production.
//
// Objects can't be backdated through the Storage API, so the runs that should
// delete pass a negative `olderThanHours`, which puts the cutoff in the future
// and makes everything count as old. That also sweeps any other unreferenced
// object in the local bucket, which is what the sweep is for.
//
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { serviceRoleClient } from "../../../test/integration-setup";
import { SITE_PHOTOS_BUCKET } from "./site-photos";

// site-photo-purge.ts imports "server-only", which throws outside a real
// Next.js server build.
mock.module("server-only", () => ({}));

const { runSitePhotoPurge } = await import("./site-photo-purge");

const service = serviceRoleClient();

/** Everything old: the cutoff is an hour from now. */
const EVERYTHING_OLD = { olderThanHours: -1 };

let tenantId: string;
const keys: string[] = [];
const paths: Record<"published" | "draftOnly" | "inList" | "orphan", string> =
  {} as never;

function publicUrl(path: string) {
  return service.storage.from(SITE_PHOTOS_BUCKET).getPublicUrl(path).data
    .publicUrl;
}

async function upload(): Promise<string> {
  const path = `${tenantId}/${crypto.randomUUID()}.jpg`;
  const { error } = await service.storage.from(SITE_PHOTOS_BUCKET).upload(
    path,
    new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], {
      type: "image/jpeg",
    }),
  );
  if (error) throw error;
  return path;
}

async function insertContent(value: unknown, draftValue: unknown) {
  const key = `purge_test.k_${crypto.randomUUID().replaceAll("-", "_")}`;
  keys.push(key);
  const { error } = await service.from("site_content").insert({
    tenant_id: tenantId,
    key,
    value,
    draft_value: draftValue,
  });
  if (error) throw error;
}

async function exists(path: string): Promise<boolean> {
  const [folder, name] = path.split("/");
  const { data, error } = await service.storage
    .from(SITE_PHOTOS_BUCKET)
    .list(folder, { search: name });
  if (error) throw error;
  return (data ?? []).some((object) => object.name === name);
}

/**
 * The service client with one table swapped for one that doesn't exist, so
 * that read fails in PostgREST for real.
 */
function failingOn(table: string): SupabaseClient {
  return new Proxy(service, {
    get(target, property, receiver) {
      if (property === "from") {
        return (name: string) =>
          target.from(name === table ? `${table}_missing` : name);
      }
      return Reflect.get(target, property, receiver);
    },
  });
}

beforeAll(async () => {
  const { data: tenant, error } = await service
    .from("tenants")
    .select("id")
    .order("created_at")
    .limit(1)
    .single();
  if (error) throw error;
  tenantId = tenant.id as string;

  paths.published = await upload();
  paths.draftOnly = await upload();
  paths.inList = await upload();
  paths.orphan = await upload();

  await insertContent(`${publicUrl(paths.published)}#crop=0,0,1,1`, null);
  // A draft that hasn't been published yet: the live value is still empty.
  await insertContent("", publicUrl(paths.draftOnly));
  await insertContent(
    [{ name: "Cass", photo_url: publicUrl(paths.inList), bio: [] }],
    null,
  );
});

afterAll(async () => {
  await service.from("site_content").delete().in("key", keys);
  await service.storage.from(SITE_PHOTOS_BUCKET).remove(Object.values(paths));
});

describe("runSitePhotoPurge", () => {
  test("leaves a new unreferenced photo alone", async () => {
    await runSitePhotoPurge(service);
    expect(await exists(paths.orphan)).toBe(true);
  });

  test("deletes nothing when a reference read fails", async () => {
    await expect(
      runSitePhotoPurge(failingOn("events"), EVERYTHING_OLD),
    ).rejects.toThrow("events.flier_url");
    expect(await exists(paths.orphan)).toBe(true);
  });

  test("deletes an old orphan and keeps every referenced photo", async () => {
    const summary = await runSitePhotoPurge(service, EVERYTHING_OLD);

    expect(summary.deleted).toBeGreaterThanOrEqual(1);
    expect(await exists(paths.orphan)).toBe(false);
    expect(await exists(paths.published)).toBe(true);
    expect(await exists(paths.draftOnly)).toBe(true);
    expect(await exists(paths.inList)).toBe(true);
  });
});
