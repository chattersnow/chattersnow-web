import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as ArtworkActions from "./actions";
import type { ArtworkSubmission } from "./submission-types";

const refreshMock = mock(() => {});
const actualNavigation = await import("next/navigation");
mock.module("next/navigation", () => ({
  ...actualNavigation,
  useRouter: () => ({ refresh: refreshMock }),
}));

const updateMock = mock(async () => ({ success: true }) as { success: true });
const deleteMock = mock(async () => ({ success: true }) as { success: true });
mock.module("./actions", () => ({
  ...ArtworkActions,
  updateArtworkSubmissionStatusAction: updateMock,
  deleteArtworkSubmissionAction: deleteMock,
}));

const { ArtworkSubmissionReviewSheet } =
  await import("./submission-review-sheet");

const SUBMISSION: ArtworkSubmission = {
  id: "sub-1",
  submitter_name: "Ada Lovelace",
  submitter_email: "ada@example.test",
  credit_name: null,
  portfolio_url: null,
  consented_at: "2026-01-02T03:04:05.000Z",
  title: "First Light",
  medium: "Linocut",
  artist_statement: "A print of the first sunrise after the storm.",
  status: "pending",
  review_notes: null,
  reviewed_at: null,
  created_at: "2026-01-01T00:00:00.000Z",
  call: { id: "call-1", title: "Winter zine" },
  event: null,
  images: [],
};

function renderSheet(canManage = true) {
  return render(
    <ArtworkSubmissionReviewSheet
      submission={SUBMISSION}
      images={[]}
      canManage={canManage}
      defaultOpen
      withTrigger={false}
    />,
  );
}

function sheet() {
  return within(
    screen.getByRole("dialog", { name: /First Light/ }) as HTMLElement,
  );
}

describe("ArtworkSubmissionReviewSheet", () => {
  beforeEach(() => {
    updateMock.mockClear();
    deleteMock.mockClear();
    refreshMock.mockClear();
  });

  test("puts the actions in the footer, out of the scrolling body", async () => {
    renderSheet();

    const footer = document.querySelector('[data-slot="sheet-footer"]');
    expect(footer).not.toBeNull();
    expect(
      within(footer as HTMLElement).getByRole("button", { name: "Save notes" }),
    ).toBeVisible();
    expect(
      within(footer as HTMLElement).getByRole("button", {
        name: "Delete submission",
      }),
    ).toBeVisible();
  });

  test("a reader who cannot manage gets no footer", () => {
    renderSheet(false);

    expect(document.querySelector('[data-slot="sheet-footer"]')).toBeNull();
    expect(screen.queryByRole("button", { name: "Save notes" })).toBeNull();
  });

  test("asks before deleting, names the submission, and says it is final", async () => {
    const user = userEvent.setup();
    renderSheet();

    await user.click(
      sheet().getByRole("button", { name: "Delete submission" }),
    );

    const confirmation = within(await screen.findByRole("alertdialog"));
    expect(confirmation.getByText("Delete First Light?")).toBeInTheDocument();
    expect(confirmation.getByText(/cannot be undone/)).toBeInTheDocument();
    expect(deleteMock).not.toHaveBeenCalled();

    await user.click(
      confirmation.getByRole("button", { name: "Delete submission" }),
    );
    expect(deleteMock).toHaveBeenCalledWith("sub-1");
  });

  test("keeps a cancelled delete from happening at all", async () => {
    const user = userEvent.setup();
    renderSheet();

    await user.click(
      sheet().getByRole("button", { name: "Delete submission" }),
    );
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Cancel",
      }),
    );

    expect(deleteMock).not.toHaveBeenCalled();
  });

  test("prompts before an edited note is thrown away", async () => {
    const user = userEvent.setup();
    renderSheet();

    await user.type(sheet().getByLabelText("Internal notes"), "Reprint at A3");
    await user.keyboard("{Escape}");

    const confirmation = within(await screen.findByRole("alertdialog"));
    expect(confirmation.getByText("Discard changes?")).toBeInTheDocument();
    // Escape asked rather than acted: the sheet is still there, with the
    // typed note still in it. Queried by slot rather than by role -- the
    // confirmation is a modal over it, so the sheet is `aria-hidden` while it
    // stands, which is correct and makes a role lookup the wrong instrument.
    const stillOpen = document.querySelector('[data-slot="sheet-content"]');
    expect(stillOpen).not.toBeNull();
    expect(
      within(stillOpen as HTMLElement).getByLabelText("Internal notes"),
    ).toHaveValue("Reprint at A3");
  });

  test("lets an untouched sheet close without a prompt", async () => {
    const user = userEvent.setup();
    renderSheet();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});
