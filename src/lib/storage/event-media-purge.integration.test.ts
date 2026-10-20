// Integration coverage for the event-media sweep (#1608), against a real local
// Supabase stack: real objects, real `event_media` rows, the Storage API's own
// `created_at`, and `expired_event_media()` reading a real retention setting.
//
// The orphan half can't backdate objects through the Storage API, so the runs
// that should delete pass a negative `olderThanHours`, which puts the cutoff
// in the future and makes everything count as old. That also sweeps any other
// unrecorded object in the local bucket, which is what the sweep is for. The
// expiry half backdates the rows instead: `uploaded_at`, the event's date and
// the setting's `updated_at` are all plain columns to the service role.
//
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import {
  createPublishedEvent,
  serviceRoleClient,
} from "../../../test/integration-setup";
import { EVENT_MEDIA_BUCKET, eventMediaPath } from "./event-media-files";

// event-media-purge.ts imports "server-only", which throws outside a real
// Next.js server build.
mock.module("server-only", () => ({}));

const { runEventMediaPurge } = await import("./event-media-purge");

const service = serviceRoleClient();

const SETTING_KEY = "events.media_retention_days";
const DAY = 24 * 60 * 60 * 1000;
/** Everything old: the cutoff is an hour from now. */
const EVERYTHING_OLD = { olderThanHours: -1 };

let tenantId: string;
let event: Awaited<ReturnType<typeof createPublishedEvent>>;
const paths: Record<
  "orphan" | "oldRecorded" | "newRecorded" | "lateSetting",
  string
> = {} as never;
const rowIds: Partial<Record<"oldRecorded" | "newRecorded", string>> = {};

function daysAgo(days: number): string {
  return new Date(Date.now() - days * DAY).toISOString();
}

async function upload(): Promise<string> {
  const path = eventMediaPath(tenantId, event.id, "jpg");
  const { error } = await service.storage
    .from(EVENT_MEDIA_BUCKET)
    .upload(path, new Blob([new Uint8Array(4)], { type: "image/jpeg" }), {
      contentType: "image/jpeg",
    });
  if (error) throw error;
  return path;
}

async function record(path: string, uploadedAt: string): Promise<string> {
  const { data, error } = await service
    .from("event_media")
    .insert({
      tenant_id: tenantId,
      event_id: event.id,
      storage_path: path,
      original_filename: "purge-test.jpg",
      content_type: "image/jpeg",
      size_bytes: 4,
      uploaded_at: uploadedAt,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

async function objectExists(path: string): Promise<boolean> {
  const folder = path.slice(0, path.lastIndexOf("/"));
  const name = path.slice(path.lastIndexOf("/") + 1);
  const { data, error } = await service.storage
    .from(EVENT_MEDIA_BUCKET)
    .list(folder, { search: name });
  if (error) throw error;
  return (data ?? []).some((object) => object.name === name);
}

async function rowExists(id: string): Promise<boolean> {
  const { data, error } = await service
    .from("event_media")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

async function clearSetting() {
  await service
    .from("app_settings")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("key", SETTING_KEY);
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
  await clearSetting();

  // A year-old event: past any 30-day period.
  event = await createPublishedEvent({
    startsAt: daysAgo(400),
    endsAt: daysAgo(400),
  });

  paths.orphan = await upload();
  paths.oldRecorded = await upload();
  paths.newRecorded = await upload();
  rowIds.oldRecorded = await record(paths.oldRecorded, daysAgo(400));
  // Uploaded today to the same old event: inside the 14-day floor.
  rowIds.newRecorded = await record(
    paths.newRecorded,
    new Date().toISOString(),
  );
});

afterAll(async () => {
  await clearSetting();
  await service.storage.from(EVENT_MEDIA_BUCKET).remove(Object.values(paths));
  if (event) await event.cleanup();
});

describe("runEventMediaPurge", () => {
  test("leaves a new unrecorded object alone", async () => {
    await runEventMediaPurge(service);
    expect(await objectExists(paths.orphan)).toBe(true);
  });

  test("with no retention period, deletes only old orphans", async () => {
    const summary = await runEventMediaPurge(service, {
      ...EVERYTHING_OLD,
      // Ten years on: still nothing expires without a period.
      now: new Date(Date.now() + 3650 * DAY),
    });

    expect(summary.orphansDeleted).toBeGreaterThanOrEqual(1);
    expect(summary.expiredDeleted).toBe(0);
    expect(await objectExists(paths.orphan)).toBe(false);
    expect(await objectExists(paths.oldRecorded)).toBe(true);
    expect(await rowExists(rowIds.oldRecorded!)).toBe(true);
    expect(await objectExists(paths.newRecorded)).toBe(true);
  });

  test("with a period, deletes expired media and keeps what is in its warning window", async () => {
    // Set long enough ago that its own 14-day floor has passed. Inserted
    // rather than updated, since set_updated_at would overwrite the date.
    const { error } = await service.from("app_settings").insert({
      tenant_id: tenantId,
      key: SETTING_KEY,
      value: 30,
      updated_at: daysAgo(60),
    });
    if (error) throw error;

    const summary = await runEventMediaPurge(service);

    expect(summary.expiredDeleted).toBeGreaterThanOrEqual(1);
    expect(await objectExists(paths.oldRecorded)).toBe(false);
    expect(await rowExists(rowIds.oldRecorded!)).toBe(false);
    expect(await objectExists(paths.newRecorded)).toBe(true);
    expect(await rowExists(rowIds.newRecorded!)).toBe(true);
  });

  test("a period set today expires nothing for 14 days", async () => {
    // Another year-old file, with the period picked just now.
    paths.lateSetting = await upload();
    const id = await record(paths.lateSetting, daysAgo(400));
    await clearSetting();
    const { error } = await service
      .from("app_settings")
      .insert({ tenant_id: tenantId, key: SETTING_KEY, value: 30 });
    if (error) throw error;

    const expiredAt = async (days: number) => {
      const { data, error: readError } = await service.rpc(
        "expired_event_media",
        { p_now: new Date(Date.now() + days * DAY).toISOString() },
      );
      if (readError) throw readError;
      return (data ?? []).some((row: { id: string }) => row.id === id);
    };
    expect(await expiredAt(13)).toBe(false);
    expect(await expiredAt(15)).toBe(true);
  });
});
