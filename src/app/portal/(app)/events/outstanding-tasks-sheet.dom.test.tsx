import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OutstandingTasksSheet } from "./outstanding-tasks-sheet";
import type { EventTaskGroup } from "@/lib/portal/attention-items";

const groups: EventTaskGroup[] = [
  {
    eventId: "event-1",
    eventName: "Riverside Community meetup",
    eventStartsAt: "2026-09-10T05:22:00+00:00",
    tasks: [
      {
        key: "event_attendance_event-1",
        eventId: "event-1",
        eventName: "Riverside Community meetup",
        eventStartsAt: "2026-09-10T05:22:00+00:00",
        kind: "attendance",
        taskLabel: "Attendance not logged",
        href: "/portal/events/event-1?tab=attendance",
      },
      {
        key: "event_checklist_1",
        eventId: "event-1",
        eventName: "Riverside Community meetup",
        eventStartsAt: "2026-09-10T05:22:00+00:00",
        kind: "checklist",
        taskLabel: "Send thank-you emails",
        href: "/portal/events/event-1?tab=checklist",
      },
    ],
  },
  {
    eventId: "event-2",
    eventName: "Downtown Skills clinic",
    eventStartsAt: "2026-09-14T17:00:00+00:00",
    tasks: [
      {
        key: "event_planning_event-2",
        eventId: "event-2",
        eventName: "Downtown Skills clinic",
        eventStartsAt: "2026-09-14T17:00:00+00:00",
        kind: "planning",
        taskLabel: "Planning incomplete",
        href: "/portal/events/event-2?tab=planning",
      },
    ],
  },
];

describe("OutstandingTasksSheet", () => {
  test("renders a closed trigger showing the total count", () => {
    render(<OutstandingTasksSheet groups={groups} totalCount={3} />);

    const trigger = screen.getByRole("button", { name: /outstanding tasks/i });
    expect(trigger).toHaveTextContent("3");
    expect(screen.queryByText("Riverside Community meetup")).toBeNull();
  });

  test("opens on click and lists every task grouped under its event", async () => {
    const user = userEvent.setup();
    render(<OutstandingTasksSheet groups={groups} totalCount={3} />);

    await user.click(
      screen.getByRole("button", { name: /outstanding tasks/i }),
    );

    expect(
      await screen.findByText("3 open tasks across 2 events"),
    ).toBeTruthy();

    expect(
      screen.getByRole("link", { name: /riverside community meetup/i }),
    ).toHaveAttribute("href", "/portal/events/event-1");
    expect(
      screen.getByRole("link", { name: /attendance not logged/i }),
    ).toHaveAttribute("href", "/portal/events/event-1?tab=attendance");
    expect(
      screen.getByRole("link", { name: /send thank-you emails/i }),
    ).toHaveAttribute("href", "/portal/events/event-1?tab=checklist");
    expect(
      screen.getByRole("link", { name: /planning incomplete/i }),
    ).toHaveAttribute("href", "/portal/events/event-2?tab=planning");
  });

  test("starts open when deep-linked with ?tasks=open", async () => {
    render(
      <OutstandingTasksSheet groups={groups} totalCount={3} defaultOpen />,
    );

    expect(
      await screen.findByText("3 open tasks across 2 events"),
    ).toBeTruthy();
  });

  test("singularizes the description for a lone task", async () => {
    render(
      <OutstandingTasksSheet groups={[groups[1]]} totalCount={1} defaultOpen />,
    );

    expect(await screen.findByText("1 open task across 1 event")).toBeTruthy();
  });
});
