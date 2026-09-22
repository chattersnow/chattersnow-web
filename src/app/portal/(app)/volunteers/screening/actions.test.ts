import { describe, expect, mock, test } from "bun:test";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

class QueryStub {
  constructor(private result: { data?: unknown; error?: unknown }) {}
  insert() {
    return this;
  }
  update() {
    return this;
  }
  eq() {
    return this;
  }
  then<T>(onfulfilled: (value: { data?: unknown; error?: unknown }) => T) {
    return Promise.resolve(this.result).then(onfulfilled);
  }
}

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

const { createScreeningTierAction, updateScreeningTierAction } =
  await import("./actions");

function tierForm() {
  const data = new FormData();
  data.set("name", "Tier 1");
  data.set("description", "");
  data.set("sortOrder", "10");
  data.set("isActive", "on");
  return data;
}

describe("createScreeningTierAction", () => {
  test("requires a signed-in user", async () => {
    currentSupabase = fakeSupabase({ user: null }).client;
    expect(await createScreeningTierAction(tierForm())).toEqual({
      error: "You must be signed in to add a screening level.",
    });
  });

  // Naming the levels is part of the same judgement as recording outcomes
  // against them, so the catalog is gated on the same resource (#1360).
  test("denies a volunteers:manage holder", async () => {
    const { client, from } = fakeSupabase({
      permissionRows: [{ resource_key: "volunteers", level: "manage" }],
    });
    currentSupabase = client;
    expect(await createScreeningTierAction(tierForm())).toEqual({
      error: "You don't have permission to perform this action.",
    });
    expect(from).not.toHaveBeenCalled();
  });

  test("rejects a nameless level before hitting the database", async () => {
    const { client, from } = fakeSupabase();
    currentSupabase = client;
    const data = tierForm();
    data.set("name", "  ");
    expect(await createScreeningTierAction(data)).toEqual({
      error: "A level name is required.",
      field: "name",
    });
    expect(from).not.toHaveBeenCalled();
  });

  test("inserts and revalidates on success", async () => {
    revalidatePathMock.mockClear();
    const { client, from } = fakeSupabase();
    currentSupabase = client;
    expect(await createScreeningTierAction(tierForm())).toEqual({
      success: true,
    });
    expect(from).toHaveBeenCalledWith("volunteer_screening_tiers");
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/portal/volunteers/screening",
    );
  });

  test("names the collision on a duplicate level", async () => {
    const { client } = fakeSupabase({ result: { error: { code: "23505" } } });
    currentSupabase = client;
    expect(await createScreeningTierAction(tierForm())).toEqual({
      error: "A screening level with this name already exists.",
    });
  });
});

describe("updateScreeningTierAction", () => {
  // A level's name is printed beside every outcome that cites it, so a rename
  // has to reach the person profile and the application sheet too.
  test("revalidates the surfaces that print the level's name", async () => {
    revalidatePathMock.mockClear();
    const { client } = fakeSupabase();
    currentSupabase = client;
    expect(await updateScreeningTierAction("t1", tierForm())).toEqual({
      success: true,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/portal/people", "layout");
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/portal/volunteers/applications",
    );
  });
});
