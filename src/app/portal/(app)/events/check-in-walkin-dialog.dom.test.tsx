import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as RegistrantsActions from "./registrants-actions";
import * as PeopleActions from "../people/actions";
import type { RegistrationQuestion } from "@/lib/registration-questions";

type ActionResult = { error: string } | { success: true };

const createWalkInCheckInActionMock = mock<
  (
    eventId: string,
    person: {
      id: string;
      name: string | null;
      email: string | null;
      phone: string | null;
    },
    partySize: number,
    optionCounts?: Record<string, number> | null,
    answers?: Record<string, unknown> | null,
  ) => Promise<ActionResult>
>(async () => ({ success: true }));

// #1407. No question by default; the case that is about one sets it.
const listOptionsMock = mock<
  () => Promise<{
    data: {
      prompt: string;
      options: {
        id: string;
        label: string;
        cap: number | null;
        taken: number;
      }[];
    } | null;
  }>
>(async () => ({ data: null }));

// #1501. No questions by default; the case that is about them sets them.
const listQuestionsMock = mock<() => Promise<{ data: RegistrationQuestion[] }>>(
  async () => ({ data: [] }),
);

mock.module("./registrants-actions", () => ({
  ...RegistrantsActions,
  createWalkInCheckInAction: createWalkInCheckInActionMock,
  listEventRegistrationOptionsAction: listOptionsMock,
  listEventRegistrationQuestionsAction: listQuestionsMock,
}));

const listPeopleActionMock = mock(async () => ({
  data: [
    {
      id: "person-1",
      name: "Sam Walk-in",
      email: "sam@example.test",
      phone: null,
    },
  ],
}));

mock.module("../people/actions", () => ({
  ...PeopleActions,
  listPeopleAction: listPeopleActionMock,
}));

const { CheckInWalkInDialog } = await import("./check-in-walkin-dialog");

describe("CheckInWalkInDialog", () => {
  beforeEach(() => {
    createWalkInCheckInActionMock.mockClear();
    listOptionsMock.mockImplementation(async () => ({ data: null }));
    listQuestionsMock.mockImplementation(async () => ({ data: [] }));
  });

  test("checks in a walk-in with the selected person and party size", async () => {
    const user = userEvent.setup();
    render(<CheckInWalkInDialog eventId="event-1" />);

    await user.click(
      screen.getByRole("button", { name: "+ Check in walk-in" }),
    );
    await user.type(
      screen.getByPlaceholderText("Search by name or email..."),
      "Sam",
    );
    const match = await screen.findByText("Sam Walk-in");
    await user.click(match);

    await user.click(screen.getByRole("button", { name: "Check in walk-in" }));

    expect(createWalkInCheckInActionMock).toHaveBeenCalledWith(
      "event-1",
      {
        id: "person-1",
        name: "Sam Walk-in",
        email: "sam@example.test",
        phone: null,
      },
      1,
      null,
      null,
    );
  });

  test("pre-checks Attendee when creating a new person", async () => {
    // Issue #569: a bare walk-in defaulted to the Sponsor role.
    const user = userEvent.setup();
    render(<CheckInWalkInDialog eventId="event-1" />);

    await user.click(
      screen.getByRole("button", { name: "+ Check in walk-in" }),
    );
    await user.click(
      screen.getByRole("button", { name: "+ Create new person" }),
    );

    expect(screen.getByRole("checkbox", { name: "Attendee" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Sponsor" })).not.toBeChecked();
  });

  test("rejects a walk-in with no person selected", async () => {
    const user = userEvent.setup();
    render(<CheckInWalkInDialog eventId="event-1" />);

    await user.click(
      screen.getByRole("button", { name: "+ Check in walk-in" }),
    );
    await user.click(screen.getByRole("button", { name: "Check in walk-in" }));

    expect(
      screen.getByText("Select or create a person to check in."),
    ).toBeInTheDocument();
    expect(createWalkInCheckInActionMock).not.toHaveBeenCalled();
  });

  test("records optional answers to the event's questions (#1501)", async () => {
    listQuestionsMock.mockImplementation(async () => ({
      data: [
        {
          id: "q-leaving",
          kind: "short_text",
          prompt: "Leaving from",
          help: null,
          // Shown, but not enforced for staff.
          required: true,
          options: [],
          min_value: null,
          max_value: null,
          show_if: null,
        },
        {
          id: "q-share",
          kind: "consent",
          prompt: "OK to share my contact details",
          help: null,
          required: false,
          options: [],
          min_value: null,
          max_value: null,
          show_if: null,
        },
      ],
    }));
    const user = userEvent.setup();
    render(<CheckInWalkInDialog eventId="event-1" />);

    await user.click(
      screen.getByRole("button", { name: "+ Check in walk-in" }),
    );
    await user.type(
      screen.getByPlaceholderText("Search by name or email..."),
      "Sam",
    );
    await user.click(await screen.findByText("Sam Walk-in"));
    await user.type(await screen.findByLabelText("Leaving from"), "Stowe");

    await user.click(screen.getByRole("button", { name: "Check in walk-in" }));

    // An unticked consent box is still an answer once anything was answered.
    expect(createWalkInCheckInActionMock).toHaveBeenCalledWith(
      "event-1",
      expect.objectContaining({ id: "person-1" }),
      1,
      null,
      { "q-leaving": "Stowe", "q-share": false },
    );
  });

  test("sends no answers when staff left the questions alone (#1501)", async () => {
    listQuestionsMock.mockImplementation(async () => ({
      data: [
        {
          id: "q-share",
          kind: "consent",
          prompt: "OK to share my contact details",
          help: null,
          required: false,
          options: [],
          min_value: null,
          max_value: null,
          show_if: null,
        },
      ],
    }));
    const user = userEvent.setup();
    render(<CheckInWalkInDialog eventId="event-1" />);

    await user.click(
      screen.getByRole("button", { name: "+ Check in walk-in" }),
    );
    await user.type(
      screen.getByPlaceholderText("Search by name or email..."),
      "Sam",
    );
    await user.click(await screen.findByText("Sam Walk-in"));
    await screen.findByText("OK to share my contact details");

    await user.click(screen.getByRole("button", { name: "Check in walk-in" }));

    expect(createWalkInCheckInActionMock).toHaveBeenCalledWith(
      "event-1",
      expect.objectContaining({ id: "person-1" }),
      1,
      null,
      null,
    );
  });
});
