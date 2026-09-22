import { describe, expect, mock, test } from "bun:test";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

mock.module("@/lib/org-timezone", () => ({
  getOrgTimeZone: async () => "America/New_York",
}));
mock.module("@/lib/time", () => ({ todayInZone: () => "2026-09-22" }));

class QueryStub {
  constructor(private result: { data?: unknown; error?: unknown }) {}
  insert(payload: unknown) {
    insertedPayload = payload;
    return this;
  }
  delete() {
    return this;
  }
  eq() {
    return this;
  }
  then<T>(onfulfilled: (value: { data?: unknown; error?: unknown }) => T) {
    return Promise.resolve(this.result).then(onfulfilled);
  }
}

let insertedPayload: unknown = null;

function fakeSupabase({
  user = { id: "u1" },
  result = { error: null },
  permissionRows = [{ resource_key: "volunteer_screening", level: "manage" }],
}: {
  user?: { id: string } | null;
  result?: { data?: unknown; error?: unknown };
  permissionRows?: { resource_key: string; level: string }[];
} = {}) {
  const from = mock(() => new QueryStub(result));
  const rpc = mock(async () => ({ data: permissionRows }));
  return {
    client: { auth: { getUser: async () => ({ data: { user } }) }, from, rpc },
    from,
  };
}

let currentSupabase: ReturnType<typeof fakeSupabase>["client"];
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const { recordPersonScreeningAction, removePersonScreeningAction } =
  await import("./screening-actions");

function validForm(extra: Record<string, string> = {}) {
  const data = new FormData();
  data.set("tierId", "tier-1");
  data.set("clearedOn", "2026-09-20");
  data.set("expiresOn", "");
  for (const [key, value] of Object.entries(extra)) data.set(key, value);
  return data;
}

describe("recordPersonScreeningAction", () => {
  test("requires a signed-in user", async () => {
    currentSupabase = fakeSupabase({ user: null }).client;
    const result = await recordPersonScreeningAction("p1", validForm());
    expect(result).toEqual({
      error: "You must be signed in to record a screening outcome.",
    });
  });

  // The split this ticket is for: the wider volunteers grant is not a way in.
  test("denies a volunteers:manage holder without volunteer_screening", async () => {
    const { client, from } = fakeSupabase({
      permissionRows: [{ resource_key: "volunteers", level: "manage" }],
    });
    currentSupabase = client;
    const result = await recordPersonScreeningAction("p1", validForm());
    expect(result).toEqual({
      error: "You don't have permission to perform this action.",
    });
    expect(from).not.toHaveBeenCalled();
  });

  test("rejects a future decision date before hitting the database", async () => {
    const { client, from } = fakeSupabase();
    currentSupabase = client;
    const result = await recordPersonScreeningAction(
      "p1",
      validForm({ clearedOn: "2026-09-23" }),
    );
    expect(result).toEqual({
      error: "The decision date cannot be in the future.",
      field: "clearedOn",
    });
    expect(from).not.toHaveBeenCalled();
  });

  test("inserts the person and the three fields, and nothing else", async () => {
    revalidatePathMock.mockClear();
    insertedPayload = null;
    const { client, from } = fakeSupabase();
    currentSupabase = client;
    const result = await recordPersonScreeningAction(
      "p1",
      validForm({ notes: "DBS clear, cert 1234567890" }),
    );
    expect(result).toEqual({ success: true });
    expect(from).toHaveBeenCalledWith("person_screenings");
    expect(insertedPayload).toEqual({
      person_id: "p1",
      tier_id: "tier-1",
      cleared_on: "2026-09-20",
      expires_on: null,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/portal/people/p1");
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/portal/volunteers/applications",
    );
  });

  test("names the duplicate on a unique violation", async () => {
    const { client } = fakeSupabase({ result: { error: { code: "23505" } } });
    currentSupabase = client;
    const result = await recordPersonScreeningAction("p1", validForm());
    expect(result).toEqual({
      error: "That outcome is already recorded for this person on that date.",
    });
  });
});

describe("removePersonScreeningAction", () => {
  test("denies a volunteers:manage holder without volunteer_screening", async () => {
    const { client, from } = fakeSupabase({
      permissionRows: [{ resource_key: "volunteers", level: "manage" }],
    });
    currentSupabase = client;
    const result = await removePersonScreeningAction("s1", "p1");
    expect(result).toEqual({
      error: "You don't have permission to perform this action.",
    });
    expect(from).not.toHaveBeenCalled();
  });

  test("deletes and revalidates on success", async () => {
    revalidatePathMock.mockClear();
    const { client, from } = fakeSupabase();
    currentSupabase = client;
    const result = await removePersonScreeningAction("s1", "p1");
    expect(result).toEqual({ success: true });
    expect(from).toHaveBeenCalledWith("person_screenings");
    expect(revalidatePathMock).toHaveBeenCalledWith("/portal/people/p1");
  });
});
