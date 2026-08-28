import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PickedPerson } from "../../people/person-picker";
import * as PeopleActions from "../../people/actions";

// Mocks the Supabase client the same way participation/actions.test.ts and
// roles/actions.test.ts do (rather than mocking ./actions or ../roles/actions
// directly): those two files already own real, dedicated unit coverage for
// createVolunteerHoursAction/listEventOptionsAction/listRoleTypesAction, and
// bun's mock.module overrides a specifier for the whole test run -- stubbing
// those same functions here previously clobbered their real implementations
// in CI (a wrong module-evaluation order surfaced it there but not locally).
// Exercising the real actions against a fake Supabase client avoids that
// collision entirely.
const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

class QueryStub {
  constructor(
    private result: { data?: unknown; error?: unknown },
    private table: string,
    private inserts: { table: string; row: unknown }[],
  ) {}
  select() {
    return this;
  }
  order() {
    return this;
  }
  eq() {
    return this;
  }
  insert(row: unknown) {
    this.inserts.push({ table: this.table, row });
    return this;
  }
  then<T>(onfulfilled: (value: { data?: unknown; error?: unknown }) => T) {
    return Promise.resolve(this.result).then(onfulfilled);
  }
}

const inserts: { table: string; row: unknown }[] = [];

function fakeSupabase() {
  const from = mock(
    (table: string) => new QueryStub({ data: [], error: null }, table, inserts),
  );
  const rpc = mock(async () => ({
    data: [
      { resource_key: "volunteers", level: "manage" },
      { resource_key: "volunteer_hours_logging", level: "manage" },
    ],
  }));
  return {
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    from,
    rpc,
  };
}

mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => fakeSupabase(),
}));

const listPeopleActionMock = mock(async () => ({ data: [] }));

mock.module("../../people/actions", () => ({
  ...PeopleActions,
  listPeopleAction: listPeopleActionMock,
}));

const { LogHoursDialog } = await import("./log-hours-dialog");

const selfPerson: PickedPerson = {
  id: "self-1",
  name: "Casey Rivera",
  email: "volunteer@example.test",
  phone: null,
};

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Log hours" }));
}

describe("LogHoursDialog", () => {
  beforeEach(() => {
    inserts.length = 0;
    listPeopleActionMock.mockClear();
  });

  test("a manager sees the interactive picker regardless of selfPerson", async () => {
    const user = userEvent.setup();
    render(<LogHoursDialog canManage={true} selfPerson={selfPerson} />);
    await openDialog(user);

    expect(
      screen.getByPlaceholderText("Search by name or email..."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Casey Rivera")).not.toBeInTheDocument();
    await waitFor(() => expect(listPeopleActionMock).toHaveBeenCalled());
  });

  test("a self-log-only user with a resolved identity sees a locked, pre-filled field", async () => {
    const user = userEvent.setup();
    render(<LogHoursDialog canManage={false} selfPerson={selfPerson} />);
    await openDialog(user);

    expect(screen.getByText("Casey Rivera")).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText("Search by name or email..."),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Change" }),
    ).not.toBeInTheDocument();
    expect(listPeopleActionMock).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Hours"), "2");
    await user.click(screen.getByRole("button", { name: "Log hours" }));

    await waitFor(() => expect(inserts).toHaveLength(1));
    expect(inserts[0]).toMatchObject({
      table: "volunteer_hours",
      row: { person_id: "self-1" },
    });
  });

  test("a self-log-only user with no resolved identity falls back to the picker", async () => {
    const user = userEvent.setup();
    render(<LogHoursDialog canManage={false} selfPerson={null} />);
    await openDialog(user);

    expect(
      screen.getByPlaceholderText("Search by name or email..."),
    ).toBeInTheDocument();
    await waitFor(() => expect(listPeopleActionMock).toHaveBeenCalled());

    await user.type(screen.getByLabelText("Hours"), "2");
    await user.click(screen.getByRole("button", { name: "Log hours" }));

    expect(
      screen.getByText("Select or create a person to log hours for."),
    ).toBeInTheDocument();
    expect(inserts).toHaveLength(0);
  });

  test("re-opening after closing keeps the locked default", async () => {
    const user = userEvent.setup();
    render(<LogHoursDialog canManage={false} selfPerson={selfPerson} />);
    await openDialog(user);
    await user.keyboard("{Escape}");
    await openDialog(user);

    expect(screen.getByText("Casey Rivera")).toBeInTheDocument();
  });
});
