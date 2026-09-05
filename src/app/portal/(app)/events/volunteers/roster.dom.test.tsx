import { describe, expect, mock, test } from "bun:test";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { EventShift } from "../shifts-actions";
import type {
  EventVolunteer,
  EventVolunteerHours,
} from "../volunteers-actions";
import { buildRoster, RosterSection } from "./roster";

function noop() {}

const shiftWithRole: EventShift = {
  id: "shift-1",
  event_id: "event-1",
  label: "Basecamp AM",
  starts_at: "2026-09-01T08:00:00.000Z",
  ends_at: "2026-09-01T12:00:00.000Z",
  target_headcount: 4,
  notes: null,
  volunteer_role_type_id: "role-1",
  role_type: { id: "role-1", name: "Ride Buddy" },
};

const shiftWithoutRole: EventShift = {
  ...shiftWithRole,
  id: "shift-2",
  label: "Basecamp PM",
  volunteer_role_type_id: null,
  role_type: null,
};

const shifts = [shiftWithRole, shiftWithoutRole];

function makeVolunteer(
  overrides: Partial<EventVolunteer> = {},
): EventVolunteer {
  return {
    id: "volunteer-1",
    event_id: "event-1",
    person_id: "person-1",
    shift_id: null,
    role: null,
    volunteer_role_type_id: null,
    role_type: null,
    notes: null,
    person: { id: "person-1", name: "Jane Doe", email: null, phone: null },
    ...overrides,
  };
}

function makeHours(
  overrides: Partial<EventVolunteerHours> = {},
): EventVolunteerHours {
  return {
    id: "hours-1",
    event_id: "event-1",
    person_id: "person-1",
    hours: 3,
    logged_date: "2026-09-01",
    notes: null,
    volunteer_role_type: null,
    person: { id: "person-1", name: "Jane Doe", email: null, phone: null },
    ...overrides,
  };
}

function renderRoster(
  props: Partial<React.ComponentProps<typeof RosterSection>> = {},
) {
  return render(
    <RosterSection
      eventId="event-1"
      rows={buildRoster([makeVolunteer()], [])}
      shifts={shifts}
      mode="view"
      isDeleting={false}
      loading={false}
      onDeleteVolunteer={noop}
      onDeleteHours={noop}
      onShiftReassign={noop}
      onSaved={noop}
      {...props}
    />,
  );
}

describe("buildRoster", () => {
  test("sums every hours entry a volunteer logged", () => {
    const rows = buildRoster(
      [makeVolunteer()],
      [
        makeHours({ id: "hours-1", hours: 3 }),
        makeHours({ id: "hours-2", hours: 2.5 }),
      ],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].entries).toHaveLength(2);
    expect(rows[0].totalHours).toBe(5.5);
  });

  test("sums hours the ledger returns as strings", () => {
    const rows = buildRoster(
      [makeVolunteer()],
      [
        makeHours({ id: "hours-1", hours: "3" }),
        makeHours({ id: "hours-2", hours: "1.25" }),
      ],
    );

    expect(rows[0].totalHours).toBe(4.25);
  });

  test("keeps hours logged by someone who never signed up", () => {
    const rows = buildRoster(
      [makeVolunteer()],
      [
        makeHours({ id: "hours-2", hours: 4 }),
        makeHours({
          id: "hours-3",
          person_id: "person-2",
          hours: 2,
          person: {
            id: "person-2",
            name: "Aaron Blake",
            email: null,
            phone: null,
          },
        }),
      ],
    );

    expect(rows).toHaveLength(2);
    // Alphabetical, so the hours-only person is not exiled to the end.
    expect(rows[0].person.name).toBe("Aaron Blake");
    expect(rows[0].signup).toBeNull();
    expect(rows[0].totalHours).toBe(2);
    expect(rows[1].signup).not.toBeNull();
  });

  test("gives a volunteer with no logged hours a zero total", () => {
    const rows = buildRoster([makeVolunteer()], []);
    expect(rows[0].entries).toEqual([]);
    expect(rows[0].totalHours).toBe(0);
  });
});

describe("RosterSection role label", () => {
  test("shows the assigned shift's role", () => {
    renderRoster({
      rows: buildRoster(
        [makeVolunteer({ shift_id: "shift-1", role: "Ignored" })],
        [],
      ),
    });
    expect(screen.getByText("Ride Buddy")).toBeInTheDocument();
  });

  test("shows 'No role' for a shift with no role type", () => {
    renderRoster({
      rows: buildRoster([makeVolunteer({ shift_id: "shift-2" })], []),
    });
    expect(screen.getByText("No role")).toBeInTheDocument();
  });

  test("shows the free-text role for a shift-less signup", () => {
    renderRoster({
      rows: buildRoster(
        [makeVolunteer({ shift_id: null, role: "Setup Crew" })],
        [],
      ),
    });
    expect(screen.getByText("Setup Crew")).toBeInTheDocument();
  });

  test("shows a dash for a shift-less signup with no role or hours", () => {
    renderRoster({
      rows: buildRoster([makeVolunteer({ shift_id: null, role: null })], []),
    });

    const row = screen.getByText("Jane Doe").closest("tr");
    expect(row).not.toBeNull();
    const cells = row!.querySelectorAll("td");
    expect(cells[1]).toHaveTextContent("—");
    expect(cells[2]).toHaveTextContent("—");
    expect(cells[3]).toHaveTextContent("—");
  });
});

describe("RosterSection shift reassignment", () => {
  test("reassigning to 'No shift' calls onShiftReassign with null", async () => {
    const onShiftReassign = mock(() => {});
    const user = userEvent.setup();
    renderRoster({
      mode: "edit",
      rows: buildRoster([makeVolunteer({ shift_id: "shift-1" })], []),
      onShiftReassign,
    });

    await user.click(
      screen.getByRole("combobox", { name: "Shift for Jane Doe" }),
    );
    await user.click(await screen.findByRole("option", { name: "No shift" }));

    expect(onShiftReassign).toHaveBeenCalledWith("volunteer-1", null);
  });
});

describe("RosterSection logged hours", () => {
  test("expands a volunteer's individual entries", async () => {
    const user = userEvent.setup();
    renderRoster({
      rows: buildRoster(
        [makeVolunteer()],
        [
          makeHours({ id: "hours-1", hours: 3, notes: "Basecamp" }),
          makeHours({ id: "hours-2", hours: 2, logged_date: "2026-09-02" }),
        ],
      ),
    });

    const toggle = screen.getByRole("button", { name: /5 hours logged/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/Basecamp/)).not.toBeInTheDocument();

    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/Basecamp/)).toBeInTheDocument();
    // aria-controls only points at the detail row while it exists.
    const detailId = toggle.getAttribute("aria-controls");
    expect(detailId).not.toBeNull();
    expect(document.getElementById(detailId!)).not.toBeNull();
  });

  test("offers no expansion for a volunteer with no hours", () => {
    renderRoster({ rows: buildRoster([makeVolunteer()], []) });
    expect(
      screen.queryByRole("button", { name: /hours logged/ }),
    ).not.toBeInTheDocument();
  });

  test("summarises the roster's headcount and total hours", () => {
    renderRoster({
      rows: buildRoster([makeVolunteer()], [makeHours({ hours: 4 })]),
    });
    expect(
      screen.getByText("1 volunteer · 4 hours logged"),
    ).toBeInTheDocument();
  });
});

describe("RosterSection hours without a signup", () => {
  const rows = buildRoster(
    [],
    [
      makeHours({
        person_id: "person-2",
        hours: 2,
        person: {
          id: "person-2",
          name: "Aaron Blake",
          email: null,
          phone: null,
        },
      }),
    ],
  );

  test("marks the row and explains it", () => {
    renderRoster({ mode: "edit", rows });
    expect(screen.getByText("Not signed up")).toBeInTheDocument();
    expect(
      screen.getByText(/hours logged for this event without a signup/),
    ).toBeInTheDocument();
  });

  test("offers neither log-hours nor remove, which would always fail", () => {
    renderRoster({ mode: "edit", rows });
    expect(
      screen.queryByRole("button", { name: /^Log hours for/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Remove volunteer" }),
    ).not.toBeInTheDocument();
  });
});

describe("RosterSection truncation", () => {
  const manyRows = buildRoster(
    ["Ana", "Ben", "Cara"].map((name, index) =>
      makeVolunteer({
        id: `volunteer-${index}`,
        person_id: `person-${index}`,
        person: {
          id: `person-${index}`,
          name,
          email: null,
          phone: null,
        },
      }),
    ),
    [],
  );

  test("holds rows past the preview behind the View all sheet", async () => {
    const user = userEvent.setup();
    renderRoster({ rows: manyRows, previewRows: 2 });

    expect(screen.getByText("Ana")).toBeInTheDocument();
    expect(screen.getByText("Ben")).toBeInTheDocument();
    expect(screen.queryByText("Cara")).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "View all 3 volunteers" }),
    );

    const sheet = within(await screen.findByRole("dialog"));
    expect(sheet.getByText("Ana")).toBeInTheDocument();
    expect(sheet.getByText("Cara")).toBeInTheDocument();
  });

  test("the sheet filters volunteers by name", async () => {
    const user = userEvent.setup();
    renderRoster({ rows: manyRows, previewRows: 2 });

    await user.click(
      screen.getByRole("button", { name: "View all 3 volunteers" }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.type(
      within(dialog).getByRole("searchbox", { name: "Search volunteers" }),
      "cara",
    );

    expect(within(dialog).getByText("Cara")).toBeInTheDocument();
    expect(within(dialog).queryByText("Ana")).not.toBeInTheDocument();
    expect(within(dialog).getByRole("status")).toHaveTextContent(
      "Showing 1 of 3",
    );
  });

  test("shows no trigger when every row already fits", () => {
    renderRoster({ rows: manyRows, previewRows: 10 });
    expect(
      screen.queryByRole("button", { name: /View all/ }),
    ).not.toBeInTheDocument();
  });
});

describe("RosterSection view mode", () => {
  test("offers no destructive controls but still expands hours", async () => {
    const user = userEvent.setup();
    renderRoster({
      mode: "view",
      rows: buildRoster([makeVolunteer()], [makeHours({ hours: 3 })]),
    });

    expect(
      screen.queryByRole("button", { name: "Remove volunteer" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /3 hours logged/ }));
    expect(
      screen.queryByRole("button", { name: /Remove hours entry/ }),
    ).not.toBeInTheDocument();
  });
});
