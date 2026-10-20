import { describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";

// site-photo-purge.ts imports "server-only", which throws outside a real
// Next.js server build.
mock.module("server-only", () => ({}));

const { runSitePhotoPurge, sitePhotoPathsIn, SITE_PHOTO_REFERENCES } =
  await import("./site-photo-purge");

const TENANT = "11111111-2222-4333-8444-555555555555";
const HOUR = 60 * 60 * 1000;
const ORIGIN = "https://abcdefgh.supabase.co/storage/v1/object/public";

function ago(hours: number): string {
  return new Date(Date.now() - hours * HOUR).toISOString();
}

function url(name: string, fragment = "") {
  return `${ORIGIN}/site-photos/${TENANT}/${name}${fragment}`;
}

describe("sitePhotoPathsIn", () => {
  test("reads a plain URL and drops a crop fragment", () => {
    expect(sitePhotoPathsIn(url("a.jpg", "#crop=0.1,0.2,0.5,0.5"))).toEqual([
      `${TENANT}/a.jpg`,
    ]);
  });

  // List slots keep their photos inside JSON rows.
  test("finds URLs nested in list rows at any depth", () => {
    const value = [
      { name: "Cass", photo_url: url("cass.jpg", "#crop=0,0,1,1"), bio: [] },
      { name: "Sofie", photo_url: "", nested: { images: [url("s.webp")] } },
    ];
    expect(sitePhotoPathsIn(value)).toEqual([
      `${TENANT}/cass.jpg`,
      `${TENANT}/s.webp`,
    ]);
  });

  test("finds a URL embedded in prose or markup", () => {
    const value = `See ![team](${url("md.jpg")}) and <img src="${url("h.png")}">.`;
    expect(sitePhotoPathsIn(value)).toEqual([
      `${TENANT}/md.jpg`,
      `${TENANT}/h.png`,
    ]);
  });

  test("ignores other buckets, paths and non-strings", () => {
    expect(
      sitePhotoPathsIn({
        logo: "/chatter-logo-transparent.png",
        gear: `${ORIGIN}/gear-photos/${TENANT}/g.jpg`,
        drive: "https://drive.google.com/file/d/abc/view",
        count: 3,
        on: true,
        none: null,
      }),
    ).toEqual([]);
  });
});

type Rows = Partial<Record<string, unknown[]>>;

/**
 * A stand-in for the service-role client: the values each `table.column`
 * holds for the live set, one tenant prefix for `.list()`, and a record of
 * deletions.
 */
function fakeClient(options: {
  objects: { name: string; created_at: string | null }[];
  values?: Rows;
  failOn?: string;
}) {
  const removed: string[] = [];
  const read: string[] = [];
  const query = (table: string) => {
    let column = "";
    const chain = {
      select: (columns: string) => {
        column = columns.replace(/^id, /, "");
        return chain;
      },
      not: () => chain,
      like: () => chain,
      order: () => chain,
      range: async () => {
        const key = `${table}.${column}`;
        read.push(key);
        if (options.failOn === key) {
          return { data: null, error: { message: "boom" } };
        }
        return {
          data: (options.values?.[key] ?? []).map((value) => ({
            [column]: value,
          })),
          error: null,
        };
      },
      then: (resolve: (value: unknown) => void) =>
        resolve({ data: [{ id: TENANT }], error: null }),
    };
    return chain;
  };
  const client = {
    from: query,
    storage: {
      from: () => ({
        list: async (prefix: string, { offset }: { offset: number }) => ({
          data: prefix === TENANT && offset === 0 ? options.objects : [],
          error: null,
        }),
        remove: async (paths: string[]) => {
          removed.push(...paths);
          return { data: paths.map((name) => ({ name })), error: null };
        },
      }),
    },
  };
  return { client: client as unknown as SupabaseClient, removed, read };
}

const objects = [
  { name: "published.jpg", created_at: ago(72) },
  { name: "draft-only.jpg", created_at: ago(72) },
  { name: "in-list.jpg", created_at: ago(72) },
  { name: "flier.jpg", created_at: ago(72) },
  { name: "logo.webp", created_at: ago(72) },
  { name: "old-orphan.jpg", created_at: ago(72) },
  { name: "just-picked.jpg", created_at: ago(1) },
];

describe("runSitePhotoPurge", () => {
  test("deletes only old objects nothing references", async () => {
    const { client, removed, read } = fakeClient({
      objects,
      values: {
        "site_content.value": [url("published.jpg", "#crop=0,0,1,1")],
        "site_content.draft_value": [
          url("draft-only.jpg"),
          [{ name: "Cass", photo_url: url("in-list.jpg") }],
        ],
        "events.flier_url": [url("flier.jpg")],
        "app_settings.value": [url("logo.webp")],
      },
    });

    const summary = await runSitePhotoPurge(client);

    expect(removed).toEqual([`${TENANT}/old-orphan.jpg`]);
    expect(summary).toEqual({ tenants: 1, scanned: 7, deleted: 1, kept: 6 });
    expect(read).toEqual(
      SITE_PHOTO_REFERENCES.map(({ table, column }) => `${table}.${column}`),
    );
  });

  // Any unreadable source must stop the run: a missing reference would read
  // as "delete it".
  for (const { table, column } of SITE_PHOTO_REFERENCES) {
    test(`deletes nothing when ${table}.${column} can't be read`, async () => {
      const { client, removed } = fakeClient({
        objects,
        failOn: `${table}.${column}`,
      });

      await expect(runSitePhotoPurge(client)).rejects.toThrow("boom");
      expect(removed).toEqual([]);
    });
  }
});
