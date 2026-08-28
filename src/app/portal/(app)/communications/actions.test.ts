import { describe, expect, mock, test } from "bun:test";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

class QueryStub {
  constructor(private result: { data?: unknown; error?: unknown }) {}
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
  permissionRows = [{ resource_key: "communications", level: "manage" }],
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

const { updateContactMessageStatusAction } = await import("./actions");

describe("updateContactMessageStatusAction", () => {
  test("requires a signed-in user", async () => {
    currentSupabase = fakeSupabase({ user: null }).client;
    const result = await updateContactMessageStatusAction("msg-1", "read");
    expect(result).toEqual({
      error: "You must be signed in to update a message.",
    });
  });

  test("denies a user without communications:manage", async () => {
    const { client, from } = fakeSupabase({ permissionRows: [] });
    currentSupabase = client;
    const result = await updateContactMessageStatusAction("msg-1", "read");
    expect(result).toEqual({
      error: "You don't have permission to perform this action.",
    });
    expect(from).not.toHaveBeenCalled();
  });

  test("rejects an unrecognized status without hitting the database", async () => {
    const { client, from } = fakeSupabase();
    currentSupabase = client;
    const result = await updateContactMessageStatusAction(
      "msg-1",
      // @ts-expect-error testing an invalid value
      "bogus",
    );
    expect(result).toEqual({ error: "Not a valid status." });
    expect(from).not.toHaveBeenCalled();
  });

  test("updates and revalidates on success", async () => {
    revalidatePathMock.mockClear();
    const { client, from } = fakeSupabase({ result: { error: null } });
    currentSupabase = client;
    const result = await updateContactMessageStatusAction("msg-1", "resolved");
    expect(result).toEqual({ success: true });
    expect(from).toHaveBeenCalledWith("contact_messages");
    expect(revalidatePathMock).toHaveBeenCalledWith("/portal/communications");
  });

  test("returns a friendly error on failure", async () => {
    const { client } = fakeSupabase({ result: { error: { code: "500" } } });
    currentSupabase = client;
    const result = await updateContactMessageStatusAction("msg-1", "read");
    expect(result).toEqual({
      error: "Could not update this message. Please try again.",
    });
  });
});
