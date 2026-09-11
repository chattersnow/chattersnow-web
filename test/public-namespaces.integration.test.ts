// #888: the reserved public key namespaces, checked against what is actually
// stored.
//
// Five of the views the public site reads match a key *prefix* rather than an
// enumerated list, so a row inserted under one of them is world-readable the
// moment it exists -- and `public_site_content` has no predicate at all, so
// every `site_content` row is. Which keys are legitimate is decided by the
// TypeScript registries (`src/lib/public-namespaces.ts` collects them), and the
// database cannot see those, so nothing but this test stands between a
// `brand.internal_notes` in some future migration and `anon`.
//
// Reads through the service-role client on purpose: the invariant is about
// every tenant's rows, and a signed-in admin sees only their own.
import { describe, expect, test } from "bun:test";
import {
  RESERVED_NAMESPACES,
  unregisteredPublicKeys,
  type SettingRow,
} from "../src/lib/public-namespaces";
import { serviceRoleClient } from "./integration-setup";

const service = serviceRoleClient();

// Paged, because the invariant is "every row" and PostgREST caps a response
// at `db.max-rows`: a truncated read would quietly stop checking the tail of
// the table, which is where a newly inserted key is most likely to be.
const PAGE = 1000;

async function keysIn(table: "app_settings" | "site_content") {
  const keys: SettingRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await service
      .from(table)
      .select("key")
      .order("key")
      .range(from, from + PAGE - 1);
    expect(error).toBeNull();
    const page = data ?? [];
    keys.push(...page.map((row) => ({ table, key: String(row.key) })));
    if (page.length < PAGE) return keys;
  }
}

const rows: SettingRow[] = [
  ...(await keysIn("app_settings")),
  ...(await keysIn("site_content")),
];

describe("reserved public key namespaces", () => {
  // Without this the check below passes on an empty database, which is
  // exactly the state a broken fixture or a failed seed leaves behind.
  test("there are rows to check", () => {
    expect(
      rows.filter((row) => row.table === "app_settings").length,
    ).toBeGreaterThan(0);
    expect(
      rows.filter((row) => row.table === "site_content").length,
    ).toBeGreaterThan(0);
  });

  test("at least one reserved prefix is populated", () => {
    const reserved = rows.filter((row) =>
      RESERVED_NAMESPACES.some(
        (namespace) =>
          namespace.table === row.table && row.key.startsWith(namespace.prefix),
      ),
    );

    expect(reserved.length).toBeGreaterThan(0);
  });

  test("every key under one is registered, in every tenant", () => {
    const findings = unregisteredPublicKeys(rows);

    expect(
      findings.map(
        (finding) => `${finding.table}.${finding.key} -- ${finding.detail}`,
      ),
    ).toEqual([]);
  });
});
