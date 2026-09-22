import { describe, expect, test } from "bun:test";
import { isExpired, loadPersonScreenings } from "./person-screenings";
import type { SupabaseClient } from "@supabase/supabase-js";

function fakeSupabase(rows: unknown[]) {
  const calls: { ids?: unknown } = {};
  const query = {
    select: () => query,
    in: (_column: string, ids: unknown) => {
      calls.ids = ids;
      return query;
    },
    order: () => Promise.resolve({ data: rows }),
  };
  return {
    client: { from: () => query } as unknown as SupabaseClient,
    calls,
  };
}

const ROW = {
  id: "s1",
  person_id: "p1",
  cleared_on: "2026-03-14",
  expires_on: "2029-03-14",
  tier: { id: "t1", name: "Tier 1" },
};

describe("loadPersonScreenings", () => {
  test("returns an empty map without querying for no people", async () => {
    const { client, calls } = fakeSupabase([ROW]);
    expect(await loadPersonScreenings(client, [])).toEqual({ byPerson: {} });
    expect(calls.ids).toBeUndefined();
  });

  test("groups by person and drops person_id from the row", async () => {
    const { client } = fakeSupabase([
      ROW,
      { ...ROW, id: "s2", person_id: "p1", cleared_on: "2023-03-14" },
      { ...ROW, id: "s3", person_id: "p2" },
    ]);
    const { byPerson } = await loadPersonScreenings(client, ["p1", "p2"]);
    expect(byPerson.p1?.map((row) => row.id)).toEqual(["s1", "s2"]);
    expect(byPerson.p2?.map((row) => row.id)).toEqual(["s3"]);
    expect(Object.keys(byPerson.p1![0]).sort()).toEqual([
      "cleared_on",
      "expires_on",
      "id",
      "tier",
    ]);
  });

  test("asks for each person once, and ignores blanks", async () => {
    const { client, calls } = fakeSupabase([]);
    await loadPersonScreenings(client, ["p1", "p1", "", "p2"]);
    expect(calls.ids).toEqual(["p1", "p2"]);
  });
});

describe("isExpired", () => {
  // Both values are ISO days compared as strings, so nothing is shifted by a
  // time zone -- which is the whole reason the tenant's day is passed in.
  test("a clearance with no end date never expires", () => {
    expect(isExpired({ expires_on: null }, "2099-01-01")).toBe(false);
  });

  test("the last day is not expired", () => {
    expect(isExpired({ expires_on: "2026-09-22" }, "2026-09-22")).toBe(false);
  });

  test("the day after is", () => {
    expect(isExpired({ expires_on: "2026-09-22" }, "2026-09-23")).toBe(true);
  });
});
