// Unit coverage for searchPeopleAction's row-to-hit mapping.
//
// The permission gate and the real query live in
// `command-palette-actions.integration.test.ts`. What belongs here is the
// pure part: the label and detail fallback chains. Several of their branches
// cannot be reached through the database at all -- `people` requires a name
// unless the row is anonymous, so a row with neither name nor preferred name
// nor email only ever arrives from a select that returns nulls -- and the
// "Unnamed person" branch exists precisely for that case.
import { describe, expect, mock, test } from "bun:test";

type PersonRow = {
  id: string;
  name: string | null;
  preferred_name: string | null;
  email: string | null;
  phone: string | null;
};

class QueryStub {
  constructor(private result: { data?: unknown; error?: unknown }) {}
  select() {
    return this;
  }
  or() {
    return this;
  }
  order() {
    return this;
  }
  limit() {
    return Promise.resolve(this.result);
  }
}

function fakeSupabase({
  rows = [] as PersonRow[],
  error = null as unknown,
  permissionRows = [{ resource_key: "people", level: "view" }],
}) {
  return {
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    from: mock(() => new QueryStub({ data: rows, error })),
    rpc: mock(async () => ({ data: permissionRows })),
  };
}

let currentSupabase: ReturnType<typeof fakeSupabase>;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const { searchPeopleAction } = await import("./command-palette-actions");

function person(overrides: Partial<PersonRow> = {}): PersonRow {
  return {
    id: "p1",
    name: null,
    preferred_name: null,
    email: null,
    phone: null,
    ...overrides,
  };
}

async function hitsFor(rows: PersonRow[]) {
  currentSupabase = fakeSupabase({ rows });
  const result = await searchPeopleAction("query");
  if ("error" in result) throw new Error(result.error);
  return result.people;
}

describe("searchPeopleAction label", () => {
  test("prefers the preferred name over every other field", async () => {
    const [hit] = await hitsFor([
      person({
        preferred_name: "Sam",
        name: "Samantha Okafor",
        email: "sam@example.test",
      }),
    ]);
    expect(hit.label).toBe("Sam");
  });

  test("falls back to the legal name when there is no preferred name", async () => {
    const [hit] = await hitsFor([
      person({ name: "Samantha Okafor", email: "sam@example.test" }),
    ]);
    expect(hit.label).toBe("Samantha Okafor");
  });

  test("falls back to the email when there is no name at all", async () => {
    const [hit] = await hitsFor([person({ email: "sam@example.test" })]);
    expect(hit.label).toBe("sam@example.test");
  });

  test("labels a row with nothing to show rather than rendering blank", async () => {
    const [hit] = await hitsFor([person()]);
    expect(hit.label).toBe("Unnamed person");
  });

  test("treats a whitespace-only preferred name as absent", async () => {
    // The chain tests each candidate with .trim() || next, so a name that is
    // only spaces has to fall through -- otherwise the palette shows a row
    // with no visible text.
    const [hit] = await hitsFor([
      person({ preferred_name: "   ", name: "Samantha Okafor" }),
    ]);
    expect(hit.label).toBe("Samantha Okafor");
  });

  test("trims the label it does use", async () => {
    const [hit] = await hitsFor([person({ name: "  Samantha Okafor  " })]);
    expect(hit.label).toBe("Samantha Okafor");
  });
});

describe("searchPeopleAction detail", () => {
  test("shows the email when there is one", async () => {
    const [hit] = await hitsFor([
      person({ name: "Sam", email: "sam@example.test", phone: "555-0100" }),
    ]);
    expect(hit.detail).toBe("sam@example.test");
  });

  test("falls back to the phone number", async () => {
    const [hit] = await hitsFor([person({ name: "Sam", phone: "555-0100" })]);
    expect(hit.detail).toBe("555-0100");
  });

  test("is null when there is neither", async () => {
    const [hit] = await hitsFor([person({ name: "Sam" })]);
    expect(hit.detail).toBeNull();
  });

  test("a whitespace-only email does not become an empty detail line", async () => {
    const [hit] = await hitsFor([
      person({ name: "Sam", email: "  ", phone: "555-0100" }),
    ]);
    expect(hit.detail).toBe("555-0100");
  });
});

describe("searchPeopleAction guards", () => {
  test("a short query returns nothing without querying", async () => {
    currentSupabase = fakeSupabase({ rows: [] });

    expect(await searchPeopleAction("a")).toEqual({ people: [] });
    // The guard runs before the client is even created, so nothing was asked
    // of the database.
    expect(currentSupabase.from).not.toHaveBeenCalled();
  });

  test("a query that is only whitespace is treated as empty", async () => {
    currentSupabase = fakeSupabase({ rows: [] });

    expect(await searchPeopleAction("      ")).toEqual({ people: [] });
    expect(currentSupabase.from).not.toHaveBeenCalled();
  });

  test("a query error becomes a message, not a throw", async () => {
    currentSupabase = fakeSupabase({ rows: [], error: { message: "boom" } });

    expect(await searchPeopleAction("query")).toEqual({
      error: "Could not search people. Please try again.",
    });
  });

  test("a null data set maps to an empty list", async () => {
    currentSupabase = fakeSupabase({
      rows: null as unknown as PersonRow[],
      error: null,
    });

    expect(await searchPeopleAction("query")).toEqual({ people: [] });
  });

  test("a role without people:view is refused before the query", async () => {
    currentSupabase = fakeSupabase({ rows: [], permissionRows: [] });

    expect(await searchPeopleAction("query")).toEqual({
      error: "You don't have permission to perform this action.",
    });
    expect(currentSupabase.from).not.toHaveBeenCalled();
  });
});
