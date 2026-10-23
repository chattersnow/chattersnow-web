import { describe, expect, mock, test } from "bun:test";
import type { VolunteerHoursEntry } from "./actions";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

class QueryStub {
  /** The claim filter calls made on the query, in order. */
  claimCalls: [string, string, unknown][] = [];
  constructor(private result: { data?: unknown; error?: unknown }) {}
  is(column: string, value: unknown) {
    this.claimCalls.push(["is", column, value]);
    return this;
  }
  select() {
    return this;
  }
  order() {
    return this;
  }
  eq(column?: string, value?: unknown) {
    if (column === "claimed_by_person_id") {
      this.claimCalls.push(["eq", column, value]);
    }
    return this;
  }
  insert() {
    return this;
  }
  delete() {
    return this;
  }
  then<T>(onfulfilled: (value: { data?: unknown; error?: unknown }) => T) {
    return Promise.resolve(this.result).then(onfulfilled);
  }
}

function fakeSupabase({
  user = { id: "u1" },
  result = { error: null },
  permissionRows = [
    { resource_key: "volunteers", level: "manage" },
    { resource_key: "volunteer_hours_logging", level: "manage" },
  ],
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
    rpc,
  };
}

let currentSupabase: ReturnType<typeof fakeSupabase>["client"];
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const {
  createVolunteerHoursAction,
  deleteVolunteerHoursAction,
  listVolunteerHoursAction,
  listPendingVolunteerHoursAction,
  listEventOptionsAction,
} = await import("./actions");

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

const validFields = {
  eventId: "",
  volunteerRoleTypeId: "",
  hours: "2.5",
  loggedDate: "2026-01-05",
  notes: "",
};

describe("createVolunteerHoursAction", () => {
  test("requires a signed-in user", async () => {
    currentSupabase = fakeSupabase({ user: null }).client;
    const result = await createVolunteerHoursAction(
      "p1",
      formData(validFields),
    );
    expect(result).toEqual({ error: "You must be signed in to log hours." });
  });

  test("requires a person id", async () => {
    currentSupabase = fakeSupabase().client;
    const result = await createVolunteerHoursAction("", formData(validFields));
    expect(result).toEqual({
      error: "Select or create a person to log hours for.",
    });
  });

  test("returns validation errors without hitting the database", async () => {
    const { client, from } = fakeSupabase();
    currentSupabase = client;
    const result = await createVolunteerHoursAction(
      "p1",
      formData({ ...validFields, hours: "0" }),
    );
    expect(result).toEqual({ error: "Hours must be a positive number." });
    expect(from).not.toHaveBeenCalled();
  });

  test("inserts and revalidates on success", async () => {
    revalidatePathMock.mockClear();
    const { client, from } = fakeSupabase({ result: { error: null } });
    currentSupabase = client;
    const result = await createVolunteerHoursAction(
      "p1",
      formData(validFields),
    );
    expect(result).toEqual({ success: true });
    expect(from).toHaveBeenCalledWith("volunteer_hours");
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/portal/volunteers/participation",
    );
  });

  test("returns a friendly error on db failure", async () => {
    currentSupabase = fakeSupabase({
      result: { error: { code: "500" } },
    }).client;
    const result = await createVolunteerHoursAction(
      "p1",
      formData(validFields),
    );
    expect(result).toEqual({ error: "Could not log hours. Please try again." });
  });

  test("denies a user with neither volunteers:manage nor volunteer_hours_logging:manage", async () => {
    const { client, from } = fakeSupabase({ permissionRows: [] });
    currentSupabase = client;
    const result = await createVolunteerHoursAction(
      "p1",
      formData(validFields),
    );
    expect(result).toEqual({
      error: "You don't have permission to perform this action.",
    });
    expect(from).not.toHaveBeenCalled();
  });

  test("allows a self-logger with only volunteer_hours_logging:manage", async () => {
    revalidatePathMock.mockClear();
    const { client, from } = fakeSupabase({
      permissionRows: [
        { resource_key: "volunteer_hours_logging", level: "manage" },
      ],
    });
    currentSupabase = client;
    const result = await createVolunteerHoursAction(
      "p1",
      formData(validFields),
    );
    expect(result).toEqual({ success: true });
    expect(from).toHaveBeenCalledWith("volunteer_hours");
  });
});

describe("deleteVolunteerHoursAction", () => {
  test("requires a signed-in user", async () => {
    currentSupabase = fakeSupabase({ user: null }).client;
    const result = await deleteVolunteerHoursAction("entry-1");
    expect(result).toEqual({
      error: "You must be signed in to remove a logged hours entry.",
    });
  });

  test("denies a self-logger with only volunteer_hours_logging:manage", async () => {
    const { client, from } = fakeSupabase({
      permissionRows: [
        { resource_key: "volunteer_hours_logging", level: "manage" },
      ],
    });
    currentSupabase = client;
    const result = await deleteVolunteerHoursAction("entry-1");
    expect(result).toEqual({
      error: "You don't have permission to perform this action.",
    });
    expect(from).not.toHaveBeenCalled();
  });

  test("deletes and revalidates on success", async () => {
    revalidatePathMock.mockClear();
    const { client, from } = fakeSupabase({ result: { error: null } });
    currentSupabase = client;
    const result = await deleteVolunteerHoursAction("entry-1");
    expect(result).toEqual({ success: true });
    expect(from).toHaveBeenCalledWith("volunteer_hours");
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/portal/volunteers/participation",
    );
  });

  test("returns a friendly error on db failure", async () => {
    currentSupabase = fakeSupabase({
      result: { error: { code: "500" } },
    }).client;
    const result = await deleteVolunteerHoursAction("entry-1");
    expect(result).toEqual({
      error: "Could not remove this entry. Please try again.",
    });
  });
});

describe("listVolunteerHoursAction", () => {
  test("returns entries on success", async () => {
    const rows = [{ id: "1", hours: 2 }] as unknown as VolunteerHoursEntry[];
    currentSupabase = fakeSupabase({
      result: { data: rows, error: null },
    }).client;
    expect(await listVolunteerHoursAction()).toEqual({ data: rows });
  });

  test("returns a friendly error on failure", async () => {
    currentSupabase = fakeSupabase({
      result: { data: null, error: { code: "500" } },
    }).client;
    expect(await listVolunteerHoursAction()).toEqual({
      error: "Could not load volunteer hours. Please try again.",
    });
  });

  test("denies a user without volunteers:view", async () => {
    currentSupabase = fakeSupabase({ permissionRows: [] }).client;
    expect(await listVolunteerHoursAction()).toEqual({
      error: "You don't have permission to perform this action.",
    });
  });
});

describe("listPendingVolunteerHoursAction claim filter (#1669)", () => {
  const me = "33333333-3333-4333-8333-333333333333";
  const other = "44444444-4444-4444-8444-444444444444";

  async function claimCallsFor(
    ...args: Parameters<typeof listPendingVolunteerHoursAction>
  ) {
    const fake = fakeSupabase({ result: { data: [], error: null } });
    currentSupabase = fake.client;
    expect(await listPendingVolunteerHoursAction(...args)).toEqual({
      data: [],
    });
    const query = fake.from.mock.results[0].value as QueryStub;
    return query.claimCalls;
  }

  test("no filter narrows nothing", async () => {
    expect(await claimCallsFor()).toEqual([]);
  });

  test("unclaimed asks for a null claimant", async () => {
    expect(await claimCallsFor({ kind: "none" }, me)).toEqual([
      ["is", "claimed_by_person_id", null],
    ]);
  });

  test("mine is the caller's own person", async () => {
    expect(await claimCallsFor({ kind: "mine" }, me)).toEqual([
      ["eq", "claimed_by_person_id", me],
    ]);
  });

  test("a person is that person", async () => {
    expect(
      await claimCallsFor({ kind: "person", personId: other }, me),
    ).toEqual([["eq", "claimed_by_person_id", other]]);
  });
});

describe("listEventOptionsAction", () => {
  test("returns events on success", async () => {
    const rows = [{ id: "1", name: "Fall Fundraiser" }];
    currentSupabase = fakeSupabase({
      result: { data: rows, error: null },
    }).client;
    expect(await listEventOptionsAction()).toEqual({ data: rows });
  });

  test("returns a friendly error on failure", async () => {
    currentSupabase = fakeSupabase({
      result: { data: null, error: { code: "500" } },
    }).client;
    expect(await listEventOptionsAction()).toEqual({
      error: "Could not load events. Please try again.",
    });
  });

  test("denies a user without volunteers:view", async () => {
    currentSupabase = fakeSupabase({ permissionRows: [] }).client;
    expect(await listEventOptionsAction()).toEqual({
      error: "You don't have permission to perform this action.",
    });
  });
});
