import { describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";

// orphan-purge.ts imports "server-only", which throws outside a real Next.js
// server build. Same neutralization as ops-report-job.integration.test.ts.
mock.module("server-only", () => ({}));

const { runGearPhotoPurge } = await import("./orphan-purge");

const TENANT = "11111111-2222-4333-8444-555555555555";
const HOUR = 60 * 60 * 1000;

function ago(hours: number): string {
  return new Date(Date.now() - hours * HOUR).toISOString();
}

type FakeOptions = {
  objects: { name: string; created_at: string | null }[];
  /** Values as they are stored in `inventory_items.photo_url`. */
  referenced?: string[];
  itemsError?: string;
};

/**
 * The narrowest possible stand-in for the service-role client: enough of
 * `.from().select()`, `.storage.from().list()` and `.remove()` for the job, and
 * a record of what it was asked to delete.
 */
function fakeClient(options: FakeOptions) {
  const removed: string[] = [];
  const client = {
    from(table: string) {
      if (table === "tenants") {
        return {
          select: async () => ({ data: [{ id: TENANT }], error: null }),
        };
      }
      return {
        select: () => ({
          like: async () =>
            options.itemsError
              ? { data: null, error: { message: options.itemsError } }
              : {
                  data: (options.referenced ?? []).map((photo_url) => ({
                    photo_url,
                  })),
                  error: null,
                },
        }),
      };
    },
    storage: {
      from: () => ({
        list: async (_prefix: string, { offset }: { offset: number }) => ({
          data: offset === 0 ? options.objects : [],
          error: null,
        }),
        remove: async (paths: string[]) => {
          removed.push(...paths);
          return { data: paths.map((name) => ({ name })), error: null };
        },
      }),
    },
  };
  return { client: client as unknown as SupabaseClient, removed };
}

function publicUrl(path: string, origin = "https://abcdefgh.supabase.co") {
  return `${origin}/storage/v1/object/public/gear-photos/${path}`;
}

describe("runGearPhotoPurge", () => {
  test("deletes an old object nothing references", async () => {
    const { client, removed } = fakeClient({
      objects: [{ name: "orphan.jpg", created_at: ago(72) }],
    });

    const summary = await runGearPhotoPurge(client);

    expect(removed).toEqual([`${TENANT}/orphan.jpg`]);
    expect(summary).toEqual({ tenants: 1, scanned: 1, deleted: 1, kept: 0 });
  });

  test("keeps an old object an item still points at", async () => {
    const { client, removed } = fakeClient({
      objects: [{ name: "live.jpg", created_at: ago(72) }],
      referenced: [publicUrl(`${TENANT}/live.jpg`)],
    });

    const summary = await runGearPhotoPurge(client);

    expect(removed).toEqual([]);
    expect(summary.kept).toBe(1);
  });

  // The window is what protects a photo attached to a form that hasn't been
  // saved yet -- at that point nothing references it and it is not an orphan.
  test("keeps a recent object even though nothing references it", async () => {
    const { client, removed } = fakeClient({
      objects: [{ name: "in-progress.jpg", created_at: ago(1) }],
    });

    await runGearPhotoPurge(client);

    expect(removed).toEqual([]);
  });

  // The same object is served from the local stack, the hosted project and any
  // custom domain. Comparing whole URLs would make every one of them look
  // unreferenced.
  test("recognises a reference stored under a different origin", async () => {
    const { client, removed } = fakeClient({
      objects: [{ name: "live.jpg", created_at: ago(72) }],
      referenced: [publicUrl(`${TENANT}/live.jpg`, "http://127.0.0.1:54321")],
    });

    await runGearPhotoPurge(client);

    expect(removed).toEqual([]);
  });

  test("respects a caller-supplied window", async () => {
    const { client, removed } = fakeClient({
      objects: [{ name: "orphan.jpg", created_at: ago(2) }],
    });

    await runGearPhotoPurge(client, { olderThanHours: 1 });

    expect(removed).toEqual([`${TENANT}/orphan.jpg`]);
  });

  // An empty referenced-set reads as "delete everything", so a failed read has
  // to stop the run rather than shape it.
  test("throws rather than treating an unreadable item list as empty", async () => {
    const { client, removed } = fakeClient({
      objects: [{ name: "live.jpg", created_at: ago(72) }],
      itemsError: "connection reset",
    });

    await expect(runGearPhotoPurge(client)).rejects.toThrow(
      /Could not read referenced photos/,
    );
    expect(removed).toEqual([]);
  });

  test("keeps an object whose age cannot be read", async () => {
    const { client, removed } = fakeClient({
      objects: [{ name: "undated.jpg", created_at: null }],
    });

    await runGearPhotoPurge(client);

    expect(removed).toEqual([]);
  });
});
