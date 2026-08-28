import { describe, expect, test } from "bun:test";
import { resolveCurrentPerson, resolveCurrentPersonId } from "./current-person";

class QueryStub {
  constructor(private result: { data?: unknown; error?: unknown }) {}
  select() {
    return this;
  }
  eq() {
    return this;
  }
  async maybeSingle() {
    return this.result;
  }
}

function fakeSupabase({
  personId,
  rpcError = null,
  personRow,
  personError = null,
}: {
  personId: string | null;
  rpcError?: unknown;
  personRow?: {
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
  };
  personError?: unknown;
}) {
  return {
    rpc: async () => ({ data: personId, error: rpcError }),
    from: () => new QueryStub({ data: personRow ?? null, error: personError }),
  } as never;
}

describe("resolveCurrentPersonId", () => {
  test("returns the id from the rpc", async () => {
    const supabase = fakeSupabase({ personId: "person-1" });
    expect(await resolveCurrentPersonId(supabase)).toBe("person-1");
  });

  test("returns null when the rpc errors", async () => {
    const supabase = fakeSupabase({
      personId: null,
      rpcError: { code: "500" },
    });
    expect(await resolveCurrentPersonId(supabase)).toBeNull();
  });

  test("returns null when the rpc resolves to no person", async () => {
    const supabase = fakeSupabase({ personId: null });
    expect(await resolveCurrentPersonId(supabase)).toBeNull();
  });
});

describe("resolveCurrentPerson", () => {
  test("returns the resolved person's identity fields", async () => {
    const personRow = {
      id: "person-1",
      name: "Casey Rivera",
      email: "volunteer@example.test",
      phone: null,
    };
    const supabase = fakeSupabase({ personId: "person-1", personRow });
    expect(await resolveCurrentPerson(supabase)).toEqual(personRow);
  });

  test("returns null when the person id cannot be resolved (not signed in / no match)", async () => {
    const supabase = fakeSupabase({ personId: null });
    expect(await resolveCurrentPerson(supabase)).toBeNull();
  });

  test("returns null when the people lookup errors", async () => {
    const supabase = fakeSupabase({
      personId: "person-1",
      personError: { code: "500" },
    });
    expect(await resolveCurrentPerson(supabase)).toBeNull();
  });

  test("returns null when the people lookup finds no row", async () => {
    const supabase = fakeSupabase({
      personId: "person-1",
      personRow: undefined,
    });
    expect(await resolveCurrentPerson(supabase)).toBeNull();
  });
});
