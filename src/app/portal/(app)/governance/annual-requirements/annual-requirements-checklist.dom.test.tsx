import { describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import type { AnnualRequirement } from "./annual-requirements-actions";
import { DEFAULT_TASK_FILTERS, type TaskFilters } from "@/lib/portal/task-list";

// Mocked wholesale: the actions module reaches the server-only Supabase
// client, which throws when pulled into a client-component module graph.
const ok = async () => ({ success: true }) as const;
mock.module("./annual-requirements-actions", () => ({
  createAnnualRequirementAction: ok,
  updateAnnualRequirementAction: ok,
  updateAnnualRequirementStatusAction: ok,
}));

const actualNavigation = await import("next/navigation");
mock.module("next/navigation", () => ({
  ...actualNavigation,
  useRouter: () => ({ refresh: () => {}, replace: () => {} }),
  usePathname: () => "/portal/governance/annual-requirements",
  useSearchParams: () => new URLSearchParams(),
}));

const { AnnualRequirementsChecklist } =
  await import("./annual-requirements-checklist");

const TODAY = "2026-10-21";
const ME = { id: "p-me", name: "Me Myself", email: null, phone: null };
const OTHER = { id: "p-other", name: "Someone Else", email: null, phone: null };

function requirement(
  id: string,
  name: string,
  overrides: Partial<AnnualRequirement> = {},
): AnnualRequirement {
  return {
    id,
    name,
    due_date: "2026-12-01",
    status: "not_started",
    completed_at: null,
    external_link: null,
    document_path: null,
    document_url: null,
    body_text: null,
    responsible: null,
    ...overrides,
  };
}

const mineOverdue = requirement("r-1", "Mine and overdue", {
  due_date: "2026-10-01",
  responsible: ME,
});
const mineDoneLate = requirement("r-2", "Mine, done late", {
  due_date: "2026-10-01",
  status: "done",
  responsible: ME,
});
const othersLater = requirement("r-3", "Someone else's, later", {
  responsible: OTHER,
});
const unassigned = requirement("r-4", "Nobody's yet");
const all = [mineOverdue, mineDoneLate, othersLater, unassigned];

function renderChecklist(
  requirements: AnnualRequirement[],
  filters: Partial<TaskFilters> = {},
) {
  return render(
    <AnnualRequirementsChecklist
      requirements={requirements}
      people={[]}
      canManage={false}
      filters={{ ...DEFAULT_TASK_FILTERS, ...filters }}
      filterContext={{ today: TODAY, currentPersonId: ME.id }}
    />,
  );
}

function shown(...expected: AnnualRequirement[]) {
  for (const r of all) {
    const found = screen.queryByText(r.name) !== null;
    expect({ name: r.name, found }).toEqual({
      name: r.name,
      found: expected.includes(r),
    });
  }
}

describe("AnnualRequirementsChecklist owner and due filters (#1659)", () => {
  test("shows every requirement, whatever its status, with no filter", () => {
    renderChecklist(all);
    shown(...all);
  });

  test("Mine keeps only the signed-in person's requirements", () => {
    renderChecklist(all, { owner: "mine" });
    shown(mineOverdue, mineDoneLate);
  });

  test("Unassigned keeps only requirements with nobody responsible", () => {
    renderChecklist(all, { owner: "unassigned" });
    shown(unassigned);
  });

  test("a named person keeps only theirs", () => {
    renderChecklist(all, { owner: OTHER.id });
    shown(othersLater);
  });

  test("overdue excludes done requirements", () => {
    renderChecklist(all, { due: "overdue" });
    shown(mineOverdue);
  });

  test("owner and overdue combine", () => {
    renderChecklist(all, { owner: OTHER.id, due: "overdue" });
    shown();
    expect(
      screen.getByText("No annual requirements match these filters."),
    ).toBeTruthy();
  });

  test("offers owner and due filters but not status", () => {
    renderChecklist(all);
    expect(
      screen.getByRole("combobox", { name: "Filter by owner" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("combobox", { name: "Filter by due" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("combobox", { name: "Filter by status" }),
    ).toBeNull();
  });
});
