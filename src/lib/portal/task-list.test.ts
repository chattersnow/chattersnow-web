import { describe, expect, test } from "bun:test";
import {
  DEFAULT_TASK_FILTERS,
  addIsoDays,
  compareTaskRows,
  filterAndSortTaskRows,
  isTaskDueThisWeek,
  isTaskOverdue,
  matchesTaskOwnerAndDue,
  parseTaskFilters,
  serializeTaskFilters,
  taskFilterParamName,
  taskOwnerOptions,
  type TaskRow,
} from "./task-list";

const TODAY = "2026-10-21";
const KINDS = ["action_item", "grant"];

function row(overrides: Partial<TaskRow> & { id: string }): TaskRow {
  return {
    key: `action_item:${overrides.id}`,
    kind: "action_item",
    title: overrides.id,
    owner: null,
    dueDate: null,
    status: "open",
    statusLabel: "Open",
    isDone: false,
    source: { label: "Meeting", href: "/portal/governance/meetings/m" },
    canEdit: true,
    ...overrides,
  };
}

const ada = { id: "p-ada", name: "Ada", email: null, phone: null };
const bo = {
  id: "p-bo",
  name: "Robert",
  preferred_name: "Bo",
  email: null,
  phone: null,
};

describe("parseTaskFilters / serializeTaskFilters", () => {
  test("defaults to open work for anyone", () => {
    expect(parseTaskFilters(new URLSearchParams(), KINDS)).toEqual(
      DEFAULT_TASK_FILTERS,
    );
    expect(serializeTaskFilters(DEFAULT_TASK_FILTERS)).toBe("");
  });

  test("round-trips every filter", () => {
    const filters = {
      owner: "mine",
      type: "grant",
      due: "overdue",
      status: "all",
    } as const;
    const query = serializeTaskFilters(filters);
    expect(parseTaskFilters(new URLSearchParams(query), KINDS)).toEqual(
      filters,
    );
  });

  test("falls back to defaults for values it does not know", () => {
    expect(
      parseTaskFilters(
        { type: "conduct_report", due: "soon", status: ["nope"] },
        KINDS,
      ),
    ).toEqual(DEFAULT_TASK_FILTERS);
  });
});

describe("due vocabulary", () => {
  test("addIsoDays crosses month ends", () => {
    expect(addIsoDays("2026-10-30", 3)).toBe("2026-11-02");
  });

  test("overdue means past due and not done", () => {
    expect(isTaskOverdue(row({ id: "a", dueDate: "2026-10-20" }), TODAY)).toBe(
      true,
    );
    expect(isTaskOverdue(row({ id: "b", dueDate: TODAY }), TODAY)).toBe(false);
    expect(
      isTaskOverdue(
        row({ id: "c", dueDate: "2026-10-01", isDone: true }),
        TODAY,
      ),
    ).toBe(false);
    expect(isTaskOverdue(row({ id: "d" }), TODAY)).toBe(false);
  });

  test("this week is today through six days out", () => {
    expect(isTaskDueThisWeek(row({ id: "a", dueDate: TODAY }), TODAY)).toBe(
      true,
    );
    expect(
      isTaskDueThisWeek(row({ id: "b", dueDate: "2026-10-27" }), TODAY),
    ).toBe(true);
    expect(
      isTaskDueThisWeek(row({ id: "c", dueDate: "2026-10-28" }), TODAY),
    ).toBe(false);
    expect(
      isTaskDueThisWeek(row({ id: "d", dueDate: "2026-10-20" }), TODAY),
    ).toBe(false);
  });
});

describe("filterAndSortTaskRows", () => {
  const rows = [
    row({ id: "undated", owner: ada }),
    row({ id: "later", dueDate: "2026-12-01", owner: bo }),
    row({ id: "overdue", dueDate: "2026-10-01", owner: ada }),
    row({ id: "soon", dueDate: "2026-10-23", kind: "grant" }),
    row({ id: "done", dueDate: "2026-09-01", isDone: true, owner: ada }),
  ];
  const context = { today: TODAY, currentPersonId: ada.id };
  const ids = (filters: Partial<typeof DEFAULT_TASK_FILTERS>) =>
    filterAndSortTaskRows(
      rows,
      { ...DEFAULT_TASK_FILTERS, ...filters },
      context,
    ).map((r) => r.id);

  test("sorts overdue first, then by due date, then undated", () => {
    expect(ids({})).toEqual(["overdue", "soon", "later", "undated"]);
  });

  test("an overdue row outranks an earlier done one when both show", () => {
    expect(ids({ status: "all" })).toEqual([
      "overdue",
      "done",
      "soon",
      "later",
      "undated",
    ]);
  });

  test("filters by status", () => {
    expect(ids({ status: "done" })).toEqual(["done"]);
  });

  test("filters by owner: Mine, a person, unassigned", () => {
    expect(ids({ owner: "mine" })).toEqual(["overdue", "undated"]);
    expect(ids({ owner: bo.id })).toEqual(["later"]);
    expect(ids({ owner: "unassigned" })).toEqual(["soon"]);
  });

  test("Mine matches nothing without a people row", () => {
    expect(
      filterAndSortTaskRows(
        rows,
        { ...DEFAULT_TASK_FILTERS, owner: "mine" },
        { today: TODAY, currentPersonId: null },
      ),
    ).toEqual([]);
  });

  test("filters by type and due", () => {
    expect(ids({ type: "grant" })).toEqual(["soon"]);
    expect(ids({ due: "overdue" })).toEqual(["overdue"]);
    expect(ids({ due: "week" })).toEqual(["soon"]);
  });

  test("compareTaskRows breaks ties on title", () => {
    const a = row({ id: "a", title: "Alpha", dueDate: "2026-11-01" });
    const b = row({ id: "b", title: "Beta", dueDate: "2026-11-01" });
    expect(compareTaskRows(a, b, TODAY)).toBeLessThan(0);
  });
});

test("taskOwnerOptions lists each owner once, by display name", () => {
  const options = taskOwnerOptions([
    row({ id: "1", owner: ada }),
    row({ id: "2", owner: bo }),
    row({ id: "3", owner: ada }),
    row({ id: "4" }),
  ]);
  expect(options.map((owner) => owner.id)).toEqual([ada.id, bo.id]);
});

describe("matchesTaskOwnerAndDue", () => {
  const context = { today: TODAY, currentPersonId: ada.id };
  const filters = (owner: string, due: "all" | "overdue" | "week") => ({
    owner,
    due,
  });

  test("ignores status and type: a done row still matches its owner", () => {
    const done = { owner: ada, dueDate: "2026-10-01", isDone: true };
    expect(matchesTaskOwnerAndDue(done, filters("mine", "all"), context)).toBe(
      true,
    );
    expect(
      matchesTaskOwnerAndDue(done, filters("mine", "overdue"), context),
    ).toBe(false);
  });

  test("owner and due combine", () => {
    const late = { owner: bo, dueDate: "2026-10-01", isDone: false };
    expect(
      matchesTaskOwnerAndDue(late, filters(bo.id, "overdue"), context),
    ).toBe(true);
    expect(
      matchesTaskOwnerAndDue(late, filters("mine", "overdue"), context),
    ).toBe(false);
    expect(
      matchesTaskOwnerAndDue(late, filters("unassigned", "all"), context),
    ).toBe(false);
  });
});

describe("task filter param prefix", () => {
  test("names, reads and writes the filters under the prefix", () => {
    expect(taskFilterParamName("owner", "task")).toBe("taskOwner");
    expect(taskFilterParamName("owner")).toBe("owner");

    const filters = parseTaskFilters(
      new URLSearchParams("status=draft&taskOwner=mine&taskDue=overdue"),
      ["checklist"],
      "task",
    );
    // The page's own `status` is not the list's.
    expect(filters).toEqual({
      ...DEFAULT_TASK_FILTERS,
      owner: "mine",
      due: "overdue",
    });
    expect(serializeTaskFilters(filters, "task")).toBe(
      "taskOwner=mine&taskDue=overdue",
    );
  });
});
