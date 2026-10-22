import { describe, expect, mock, test } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { EventOpenWorkRow } from "@/lib/portal/event-open-work";
import { DEFAULT_TASK_FILTERS } from "@/lib/portal/task-list";

const refresh = mock(() => {});
const replace = mock(() => {});
mock.module("next/navigation", () => ({
  useRouter: () => ({ refresh, replace }),
  usePathname: () => "/portal/events",
  useSearchParams: () => new URLSearchParams("tasks=open"),
}));

const toggleChecklist = mock(async () => ({ success: true as const }));
const setRetroDone = mock(async () => ({ success: true as const }));
const setFollowUpDone = mock(async () => ({ success: true as const }));
mock.module("./checklist-actions", () => ({
  toggleEventChecklistItemAction: toggleChecklist,
}));
mock.module("./retro-actions", () => ({
  setEventRetroActionDoneAction: setRetroDone,
}));
mock.module("./sponsors-actions", () => ({
  setEventSponsorFollowUpDoneAction: setFollowUpDone,
}));

const { OutstandingTasksSheet } = await import("./outstanding-tasks-sheet");

const riverside = {
  id: "event-1",
  name: "Riverside Community meetup",
  startsAt: "2026-09-10T05:22:00+00:00",
};
const rowan = {
  id: "person-1",
  name: "Rowan Ellis",
  email: null,
  phone: null,
};

function row(
  overrides: Partial<EventOpenWorkRow> & Pick<EventOpenWorkRow, "kind">,
): EventOpenWorkRow {
  return {
    key: `${overrides.kind}:${overrides.id ?? "1"}`,
    id: "1",
    title: "Task",
    owner: null,
    dueDate: null,
    status: "open",
    statusLabel: "Open",
    isDone: false,
    source: { label: riverside.name, href: "/portal/events/event-1" },
    canEdit: true,
    event: riverside,
    ...overrides,
  };
}

const rows: EventOpenWorkRow[] = [
  row({
    kind: "checklist",
    id: "c1",
    title: "Send thank-you emails",
    owner: rowan,
    dueDate: "2026-09-01",
    source: {
      label: riverside.name,
      href: "/portal/events/event-1?tab=checklist",
    },
  }),
  row({
    kind: "sponsor_follow_up",
    id: "s1",
    title: "Follow up with Summit Outfitters",
    status: "in_progress",
    statusLabel: "In progress",
  }),
  row({
    kind: "phase",
    id: "event-1",
    key: "phase:attendance:event-1",
    title: "Attendance not logged",
    owner: rowan,
    canEdit: false,
  }),
];

function renderSheet(
  overrides: Partial<Parameters<typeof OutstandingTasksSheet>[0]> = {},
) {
  return render(
    <OutstandingTasksSheet
      rows={rows}
      filters={DEFAULT_TASK_FILTERS}
      owners={[rowan]}
      today="2026-09-05"
      openCount={3}
      {...overrides}
    />,
  );
}

describe("OutstandingTasksSheet", () => {
  test("renders a closed trigger showing the open count", () => {
    renderSheet();

    const trigger = screen.getByRole("button", { name: /outstanding tasks/i });
    expect(trigger).toHaveTextContent("3");
    expect(screen.queryByText("Send thank-you emails")).toBeNull();
  });

  test("starts open when deep-linked and lists each task with owner and event", async () => {
    renderSheet({ defaultOpen: true });

    expect(await screen.findByText(/3 open tasks/)).toBeTruthy();
    expect(screen.getByText("Send thank-you emails")).toBeTruthy();
    expect(screen.getAllByText("Rowan Ellis").length).toBeGreaterThan(0);
    expect(screen.getByText("Overdue")).toBeTruthy();
    const eventLinks = screen.getAllByRole("link", {
      name: riverside.name,
    });
    expect(eventLinks[0]).toHaveAttribute(
      "href",
      "/portal/events/event-1?tab=checklist",
    );
  });

  test("checks an editable row off through its source's action", async () => {
    const user = userEvent.setup();
    renderSheet({ defaultOpen: true });

    await user.click(
      await screen.findByRole("checkbox", {
        name: 'Mark "Send thank-you emails" done',
      }),
    );
    await waitFor(() =>
      expect(toggleChecklist).toHaveBeenCalledWith("c1", true),
    );

    await user.click(
      screen.getByRole("checkbox", {
        name: 'Mark "Follow up with Summit Outfitters" done',
      }),
    );
    await waitFor(() =>
      expect(setFollowUpDone).toHaveBeenCalledWith("s1", true),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  test("phase tasks and view-only rows get no check-off control", async () => {
    renderSheet({
      defaultOpen: true,
      rows: rows.map((item) => ({ ...item, canEdit: false })),
    });

    expect(await screen.findByText("Attendance not logged")).toBeTruthy();
    expect(screen.queryAllByRole("checkbox")).toEqual([]);
  });

  test("singularizes the description for a lone task", async () => {
    renderSheet({ defaultOpen: true, rows: [rows[0]], openCount: 1 });

    expect(await screen.findByText(/1 open task,/)).toBeTruthy();
  });
});
