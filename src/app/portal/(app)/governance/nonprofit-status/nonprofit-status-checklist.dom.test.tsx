import { beforeEach, describe, expect, mock, test } from "bun:test";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  expectToast,
  hasToast,
  renderWithToaster,
} from "../../../../../../test/toast-testing";
import type { Milestone } from "./nonprofit-status-actions";
import { DEFAULT_TASK_FILTERS, type TaskFilters } from "@/lib/portal/task-list";

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
  useRouter: () => ({ refresh: () => {}, replace: () => {} }),
  usePathname: () => "/portal/governance/nonprofit-status",
  useSearchParams: () => new URLSearchParams(),
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

const TODAY = "2026-10-21";
const ME = { id: "p-me", name: "Me Myself", email: null, phone: null };
const OTHER = { id: "p-other", name: "Someone Else", email: null, phone: null };

function renderChecklist(
  milestones: Milestone[] = [milestone],
  filters: Partial<TaskFilters> = {},
) {
  return renderWithToaster(
    <NonprofitStatusChecklist
      milestones={milestones}
      people={[]}
      canManage={true}
      filters={{ ...DEFAULT_TASK_FILTERS, ...filters }}
      filterContext={{ today: TODAY, currentPersonId: ME.id }}
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

describe("NonprofitStatusChecklist owner and due filters (#1659)", () => {
  const mineOverdue: Milestone = {
    ...milestone,
    id: "m-mine",
    description: "Mine and overdue",
    due_date: "2026-10-01",
    owner: ME,
  };
  const mineDoneLate: Milestone = {
    ...milestone,
    id: "m-done",
    description: "Mine, done late",
    due_date: "2026-10-01",
    status: "done",
    owner: ME,
  };
  const othersLater: Milestone = {
    ...milestone,
    id: "m-other",
    description: "Someone else's, later",
    due_date: "2026-12-01",
    owner: OTHER,
  };
  const all = [mineOverdue, mineDoneLate, othersLater, milestone];

  test("shows every milestone with no filter", () => {
    renderChecklist(all);
    for (const m of all) expect(screen.getByText(m.description)).toBeTruthy();
  });

  test("Mine keeps only the signed-in person's milestones", () => {
    renderChecklist(all, { owner: "mine" });
    expect(screen.getByText(mineOverdue.description)).toBeTruthy();
    expect(screen.getByText(mineDoneLate.description)).toBeTruthy();
    expect(screen.queryByText(othersLater.description)).toBeNull();
    expect(screen.queryByText(milestone.description)).toBeNull();
  });

  test("a named owner keeps only theirs", () => {
    renderChecklist(all, { owner: OTHER.id });
    expect(screen.getByText(othersLater.description)).toBeTruthy();
    expect(screen.queryByText(mineOverdue.description)).toBeNull();
  });

  test("overdue excludes done and undated milestones", () => {
    renderChecklist(all, { due: "overdue" });
    expect(screen.getByText(mineOverdue.description)).toBeTruthy();
    expect(screen.queryByText(mineDoneLate.description)).toBeNull();
    expect(screen.queryByText(othersLater.description)).toBeNull();
    expect(screen.queryByText(milestone.description)).toBeNull();
  });

  test("says so when nothing matches, and keeps the whole count", () => {
    renderChecklist([othersLater], { owner: "mine" });
    expect(screen.getByText("No milestones match these filters")).toBeTruthy();
    expect(screen.getByText("0 of 1 complete")).toBeTruthy();
  });
});
