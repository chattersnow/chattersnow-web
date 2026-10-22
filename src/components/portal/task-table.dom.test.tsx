import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DEFAULT_TASK_FILTERS, type TaskRow } from "@/lib/portal/task-list";

const replace = mock((_href: string, _options?: unknown) => {});
let search = "";

const actualNavigation = await import("next/navigation");
mock.module("next/navigation", () => ({
  ...actualNavigation,
  useRouter: () => ({ replace, refresh: () => {} }),
  usePathname: () => "/portal/governance/meetings",
  useSearchParams: () => new URLSearchParams(search),
}));

const { TaskTable } = await import("./task-table");

const row: TaskRow = {
  key: "action_item:a-1",
  id: "a-1",
  kind: "action_item",
  title: "Send the minutes",
  owner: null,
  dueDate: "2026-10-01",
  status: "open",
  statusLabel: "Open",
  isDone: false,
  source: { label: "Board meeting", href: "/portal/governance/meetings/m-1" },
  canEdit: false,
};

function renderTable(kindLabels: Record<string, string>) {
  return render(
    <TaskTable
      rows={[row]}
      filters={DEFAULT_TASK_FILTERS}
      owners={[]}
      today="2026-10-21"
      kindLabels={kindLabels}
    />,
  );
}

describe("TaskTable (#1659)", () => {
  beforeEach(() => {
    replace.mockClear();
    search = "";
  });

  test("a single-kind list has no Type filter or column", () => {
    renderTable({ action_item: "Action item" });
    expect(
      screen.queryByRole("combobox", { name: "Filter by type" }),
    ).toBeNull();
    expect(screen.queryByRole("columnheader", { name: /^Type/ })).toBeNull();
    expect(
      screen.getByRole("combobox", { name: "Filter by owner" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("combobox", { name: "Filter by due" }),
    ).toBeTruthy();
  });

  test("a multi-kind list keeps them", () => {
    renderTable({ action_item: "Action item", milestone: "Milestone" });
    expect(
      screen.getByRole("combobox", { name: "Filter by type" }),
    ).toBeTruthy();
  });

  test("a filter change keeps the tab and replaces the old filters", async () => {
    search = "tab=action-items&owner=mine";
    const user = userEvent.setup();
    renderTable({ action_item: "Action item" });

    await user.click(screen.getByRole("combobox", { name: "Filter by due" }));
    await user.click(screen.getByRole("option", { name: "Overdue" }));

    await waitFor(() => expect(replace).toHaveBeenCalled());
    // DEFAULT_TASK_FILTERS says owner is "all", so the stale owner=mine in
    // the URL is dropped -- the props, not the URL, are the filters' state.
    expect(replace.mock.calls[0][0]).toBe(
      "/portal/governance/meetings?tab=action-items&due=overdue",
    );
  });
});
