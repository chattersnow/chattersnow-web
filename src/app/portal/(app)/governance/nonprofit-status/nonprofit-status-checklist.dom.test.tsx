import { beforeEach, describe, expect, mock, test } from "bun:test";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  expectToast,
  hasToast,
  renderWithToaster,
} from "../../../../../../test/toast-testing";
import type { Milestone } from "./nonprofit-status-actions";

const updateStatusMock = mock(
  async (
    _id: string,
    _status: string,
  ): Promise<{ error: string } | { success: true }> => ({ success: true }),
);

// Mocked wholesale rather than spread over the real module: the actions
// module reaches the server-only Supabase client, which throws when pulled
// into a client-component module graph.
const ok = async () => ({ success: true }) as const;

mock.module("./nonprofit-status-actions", () => ({
  createMilestoneAction: ok,
  updateMilestoneAction: ok,
  deleteMilestoneAction: ok,
  updateMilestoneStatusAction: updateStatusMock,
}));

const actualNavigation = await import("next/navigation");
mock.module("next/navigation", () => ({
  ...actualNavigation,
  useRouter: () => ({ refresh: () => {} }),
}));

const { NonprofitStatusChecklist } =
  await import("./nonprofit-status-checklist");

const milestone: Milestone = {
  id: "m-1",
  description: "File the certificate of incorporation",
  phase: "Phase 2 — Incorporation (NJ)",
  due_date: null,
  status: "not_started",
  notes: null,
  owner: null,
};

function renderChecklist() {
  return renderWithToaster(
    <NonprofitStatusChecklist
      milestones={[milestone]}
      people={[]}
      canManage={true}
    />,
  );
}

async function setStatus(label: string) {
  const user = userEvent.setup();
  renderChecklist();
  await user.click(
    screen.getByRole("combobox", {
      name: `Status for ${milestone.description}`,
    }),
  );
  await user.click(screen.getByRole("option", { name: label }));
}

describe("NonprofitStatusChecklist status toggle", () => {
  beforeEach(() => {
    updateStatusMock.mockClear();
    updateStatusMock.mockImplementation(async () => ({ success: true }));
  });

  // The select snaps to the new value whether or not the write landed, so the
  // toast is the only thing that distinguishes a save from a failure.
  test("names the milestone and its new status", async () => {
    await setStatus("Done");

    expect(updateStatusMock).toHaveBeenCalledWith("m-1", "done");
    await expectToast(`${milestone.description} — Done.`);
  });

  test("announces a failure rather than confirming it", async () => {
    updateStatusMock.mockImplementation(async () => ({
      error: "You do not have permission to update milestones.",
    }));
    await setStatus("Done");

    await expectToast("You do not have permission to update milestones.");
    expect(hasToast(`${milestone.description} — Done.`)).toBe(false);
  });
});
