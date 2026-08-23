import { describe, expect, mock, test } from "bun:test";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

class QueryStub {
  constructor(private result: { data?: unknown; error?: unknown }) {}
  select() {
    return this;
  }
  order() {
    return this;
  }
  eq() {
    return this;
  }
  insert() {
    return this;
  }
  update() {
    return this;
  }
  then<T>(onfulfilled: (value: { data?: unknown; error?: unknown }) => T) {
    return Promise.resolve(this.result).then(onfulfilled);
  }
}

function fakeSupabase({
  user = { id: "u1" },
  result = { error: null },
  permissionRows = [{ resource_key: "volunteers", level: "manage" }],
}: {
  user?: { id: string } | null;
  result?: { data?: unknown; error?: unknown };
  permissionRows?: { resource_key: string; level: string }[];
} = {}) {
  const from = mock(() => new QueryStub(result));
  const rpc = mock(async () => ({ data: permissionRows }));
  return { client: { auth: { getUser: async () => ({ data: { user } }) }, from, rpc }, from, rpc };
}

let currentSupabase: ReturnType<typeof fakeSupabase>["client"];
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const { createRoleTypeAction, updateRoleTypeAction, listRoleTypesAction } = await import(
  "./actions"
);

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

describe("createRoleTypeAction", () => {
  test("requires a signed-in user", async () => {
    currentSupabase = fakeSupabase({ user: null }).client;
    const result = await createRoleTypeAction(formData({ name: "Ride Buddy" }));
    expect(result).toEqual({ error: "You must be signed in to create a role type." });
  });

  test("returns validation errors without hitting the database", async () => {
    const { client, from } = fakeSupabase();
    currentSupabase = client;
    const result = await createRoleTypeAction(formData({ name: "" }));
    expect(result).toEqual({ error: "Role name is required." });
    expect(from).not.toHaveBeenCalled();
  });

  test("inserts and revalidates on success", async () => {
    revalidatePathMock.mockClear();
    const { client, from } = fakeSupabase({ result: { error: null } });
    currentSupabase = client;
    const result = await createRoleTypeAction(
      formData({ name: "Ride Buddy", description: "Skis alongside a participant." }),
    );
    expect(result).toEqual({ success: true });
    expect(from).toHaveBeenCalledWith("volunteer_role_types");
    expect(revalidatePathMock).toHaveBeenCalledWith("/portal/volunteers/roles");
  });

  test("maps a unique-violation into a friendly message", async () => {
    const { client } = fakeSupabase({ result: { error: { code: "23505" } } });
    currentSupabase = client;
    const result = await createRoleTypeAction(formData({ name: "Ride Buddy" }));
    expect(result).toEqual({ error: "A role type with this name already exists." });
  });

  test("falls back to a generic message for other db errors", async () => {
    const { client } = fakeSupabase({ result: { error: { code: "500" } } });
    currentSupabase = client;
    const result = await createRoleTypeAction(formData({ name: "Ride Buddy" }));
    expect(result).toEqual({ error: "Could not create the role type. Please try again." });
  });

  test("denies a user without volunteers:manage", async () => {
    const { client, from } = fakeSupabase({ permissionRows: [] });
    currentSupabase = client;
    const result = await createRoleTypeAction(formData({ name: "Ride Buddy" }));
    expect(result).toEqual({ error: "You don't have permission to perform this action." });
    expect(from).not.toHaveBeenCalled();
  });
});

describe("updateRoleTypeAction", () => {
  test("requires a signed-in user", async () => {
    currentSupabase = fakeSupabase({ user: null }).client;
    const result = await updateRoleTypeAction("id-1", formData({ name: "Ride Buddy" }));
    expect(result).toEqual({ error: "You must be signed in to update a role type." });
  });

  test("updates and revalidates on success", async () => {
    revalidatePathMock.mockClear();
    const { client, from } = fakeSupabase({ result: { error: null } });
    currentSupabase = client;
    const result = await updateRoleTypeAction("id-1", formData({ name: "Ride Buddy" }));
    expect(result).toEqual({ success: true });
    expect(from).toHaveBeenCalledWith("volunteer_role_types");
    expect(revalidatePathMock).toHaveBeenCalledWith("/portal/volunteers/roles");
  });

  test("maps a unique-violation into a friendly message", async () => {
    const { client } = fakeSupabase({ result: { error: { code: "23505" } } });
    currentSupabase = client;
    const result = await updateRoleTypeAction("id-1", formData({ name: "Ride Buddy" }));
    expect(result).toEqual({ error: "A role type with this name already exists." });
  });

  test("denies a user without volunteers:manage", async () => {
    const { client, from } = fakeSupabase({ permissionRows: [] });
    currentSupabase = client;
    const result = await updateRoleTypeAction("id-1", formData({ name: "Ride Buddy" }));
    expect(result).toEqual({ error: "You don't have permission to perform this action." });
    expect(from).not.toHaveBeenCalled();
  });
});

describe("listRoleTypesAction", () => {
  test("returns the role types on success", async () => {
    const rows = [{ id: "1", name: "Ride Buddy" }];
    currentSupabase = fakeSupabase({ result: { data: rows, error: null } }).client;
    expect(await listRoleTypesAction()).toEqual({ data: rows });
  });

  test("returns a friendly error on failure", async () => {
    currentSupabase = fakeSupabase({ result: { data: null, error: { code: "500" } } }).client;
    expect(await listRoleTypesAction()).toEqual({
      error: "Could not load role types. Please try again.",
    });
  });

  test("denies a user without volunteers:view", async () => {
    currentSupabase = fakeSupabase({ permissionRows: [] }).client;
    expect(await listRoleTypesAction()).toEqual({
      error: "You don't have permission to perform this action.",
    });
  });
});
