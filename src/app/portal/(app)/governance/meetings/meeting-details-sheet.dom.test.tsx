import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MeetingDetailsSheet } from "./meeting-details-sheet";
import type { MeetingRow } from "./meeting-badges";

function makeMeeting(overrides: Partial<MeetingRow> = {}): MeetingRow {
  return {
    id: "meeting-1",
    meeting_date: "2026-09-01T18:00:00.000Z",
    meeting_type: "board",
    status: "scheduled",
    location: "HQ",
    notes: null,
    facilitator: null,
    notetaker: null,
    ...overrides,
  };
}

async function openSheet(user: ReturnType<typeof userEvent.setup>) {
  render(<MeetingDetailsSheet meeting={makeMeeting()} />);
  await user.click(
    screen.getByRole("button", { name: "View meeting details" }),
  );
}

describe("MeetingDetailsSheet", () => {
  test("no longer offers a separate Minutes tab", async () => {
    const user = userEvent.setup();
    await openSheet(user);

    expect(
      screen.queryByRole("tab", { name: "Minutes" }),
    ).not.toBeInTheDocument();
  });

  test("keeps the other six tabs", async () => {
    const user = userEvent.setup();
    await openSheet(user);

    for (const label of [
      "Overview",
      "Attendees",
      "Agenda",
      "Action Items",
      "Decisions",
      "Resolutions",
    ]) {
      expect(screen.getByRole("tab", { name: label })).toBeInTheDocument();
    }
  });

  test("renders the widened (2xl) sheet content", async () => {
    const user = userEvent.setup();
    await openSheet(user);

    const content = document.querySelector('[data-slot="sheet-content"]');
    expect(content).not.toBeNull();
    expect(content?.className).toContain("sm:max-w-[880px]");
    expect(content?.className).not.toContain("sm:max-w-[640px]");
  });
});
