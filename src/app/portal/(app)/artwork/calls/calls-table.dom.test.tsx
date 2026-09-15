// #1157: the calls list is a table, and a call can be deleted. The delete is
// the part worth pinning down -- artwork_submissions cascades off the call, so
// the confirmation has to say what goes with it before a curator agrees to it.
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as CallActions from "./actions";
import type { ArtworkCall } from "../submission-types";

const refreshMock = mock(() => {});
const actualNavigation = await import("next/navigation");
mock.module("next/navigation", () => ({
  ...actualNavigation,
  useRouter: () => ({ refresh: refreshMock }),
}));

const deleteMock = mock(async () => ({ success: true }) as { success: true });
mock.module("./actions", () => ({
  ...CallActions,
  deleteArtworkCallAction: deleteMock,
}));

const { ArtworkCallsTable } = await import("./calls-table");

function makeCall(overrides: Partial<ArtworkCall> = {}): ArtworkCall {
  return {
    id: "call-1",
    title: "Zine Vol 1 Open Call",
    timezone: "America/New_York",
    event_id: null,
    submission_code: "XCA9YEYEJ4JC",
    is_open: true,
    opens_at: null,
    closes_at: "2026-09-20T07:00:00.000Z",
    intro: null,
    rights_note: null,
    max_images: 3,
    event: null,
    submission_count: 0,
    ...overrides,
  };
}

function renderTable(calls: ArtworkCall[], canManage = true) {
  return render(<ArtworkCallsTable calls={calls} canManage={canManage} />);
}

async function openDeleteDialog(name: string) {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: `Delete ${name}` }));
  return {
    user,
    dialog: within((await screen.findByRole("alertdialog")) as HTMLElement),
  };
}

beforeEach(() => {
  deleteMock.mockClear();
  refreshMock.mockClear();
});

describe("ArtworkCallsTable", () => {
  test("renders one row per call, with its link and event", () => {
    renderTable([
      makeCall({
        event: {
          id: "event-1",
          name: "Queer Ride Day",
          starts_at: "2026-09-19T12:00:00.000Z",
          timezone: "America/New_York",
        },
      }),
      makeCall({
        id: "call-2",
        title: "Test Zine",
        submission_code: "EPFXTHTPQR9J",
        is_open: false,
      }),
    ]);

    expect(screen.getByText("Zine Vol 1 Open Call")).toBeInTheDocument();
    expect(screen.getByText("For Queer Ride Day")).toBeInTheDocument();
    expect(screen.getByText("/artwork/XCA9YEYEJ4JC")).toBeInTheDocument();
    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(screen.getByText("Closed")).toBeInTheDocument();
  });

  test("the confirmation says nothing is lost when the call is empty", async () => {
    renderTable([makeCall()]);

    const { dialog } = await openDeleteDialog("Zine Vol 1 Open Call");
    expect(dialog.getByText(/Nothing has been submitted/)).toBeInTheDocument();
  });

  test("the confirmation counts the submissions the cascade would take", async () => {
    renderTable([makeCall({ submission_count: 4 })]);

    const { dialog } = await openDeleteDialog("Zine Vol 1 Open Call");
    expect(
      dialog.getByText(/4 submissions .* will be deleted with it/),
    ).toBeInTheDocument();
    expect(dialog.getByText(/cannot be undone/)).toBeInTheDocument();
  });

  test("confirming deletes the call and refreshes the page", async () => {
    renderTable([makeCall()]);

    const { user, dialog } = await openDeleteDialog("Zine Vol 1 Open Call");
    await user.click(dialog.getByRole("button", { name: "Delete call" }));

    expect(deleteMock).toHaveBeenCalledWith("call-1");
    expect(refreshMock).toHaveBeenCalled();
  });

  test("a reader without manage sees the link but no edit or delete", () => {
    renderTable([makeCall()], false);

    expect(
      screen.getByRole("button", { name: /^Copy link to/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Edit / }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Delete / }),
    ).not.toBeInTheDocument();
  });
});
