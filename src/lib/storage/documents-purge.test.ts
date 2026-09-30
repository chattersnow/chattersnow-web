import { describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";

// documents-purge.ts imports "server-only", which throws outside a real
// Next.js server build.
mock.module("server-only", () => ({}));

const { runDocumentPurge, DOCUMENT_TABLES } = await import("./documents-purge");

const TENANT = "11111111-2222-4333-8444-555555555555";
const HOUR = 60 * 60 * 1000;

function ago(hours: number): string {
  return new Date(Date.now() - hours * HOUR).toISOString();
}

type Entry = { name: string; id?: string | null; created_at?: string | null };

/**
 * A stand-in for the service-role client: a folder tree for `.list()`, a
 * `document_path` per table for the live set, and a record of deletions.
 */
function fakeClient(options: {
  tree: Record<string, Entry[]>;
  referenced?: Partial<Record<string, string[]>>;
  tableError?: string;
}) {
  const removed: string[] = [];
  const read: string[] = [];
  const query = (table: string) => {
    const chain = {
      select: () => chain,
      not: () => chain,
      order: () => chain,
      range: async () => {
        read.push(table);
        if (options.tableError) {
          return { data: null, error: { message: options.tableError } };
        }
        return {
          data: (options.referenced?.[table] ?? []).map((document_path) => ({
            document_path,
          })),
          error: null,
        };
      },
    };
    return chain;
  };
  const client = {
    from: query,
    storage: {
      from: () => ({
        list: async (prefix: string, { offset }: { offset: number }) => ({
          data: offset === 0 ? (options.tree[prefix] ?? []) : [],
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

const tree: Record<string, Entry[]> = {
  "": [{ name: TENANT, id: null }],
  [TENANT]: [{ name: "governance", id: null }],
  [`${TENANT}/governance`]: [
    { name: "a", id: null },
    { name: "b", id: null },
    { name: "c", id: null },
  ],
  [`${TENANT}/governance/a`]: [
    { name: "old-orphan.pdf", id: "1", created_at: ago(72) },
  ],
  [`${TENANT}/governance/b`]: [
    { name: "saved.pdf", id: "2", created_at: ago(72) },
  ],
  [`${TENANT}/governance/c`]: [
    { name: "just-picked.pdf", id: "3", created_at: ago(1) },
  ],
};

describe("runDocumentPurge", () => {
  test("deletes only old objects no record references", async () => {
    const { client, removed, read } = fakeClient({
      tree,
      referenced: { agendas: [`${TENANT}/governance/b/saved.pdf`] },
    });

    const summary = await runDocumentPurge(client);

    expect(removed).toEqual([`${TENANT}/governance/a/old-orphan.pdf`]);
    expect(summary).toEqual({ scanned: 3, deleted: 1, kept: 2 });
    expect(read).toEqual([...DOCUMENT_TABLES]);
  });

  // An unreadable table must stop the run: an empty live set would read as
  // "delete everything".
  test("deletes nothing when a table can't be read", async () => {
    const { client, removed } = fakeClient({ tree, tableError: "boom" });

    await expect(runDocumentPurge(client)).rejects.toThrow("boom");
    expect(removed).toEqual([]);
  });
});
