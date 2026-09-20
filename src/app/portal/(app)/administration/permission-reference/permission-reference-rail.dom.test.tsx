// The rail's own behaviour: what it groups, what it searches, and that a row
// asks the page to jump (#1334).
//
// `PortalRail` has its own tests for the two shapes it takes; what is worth
// pinning here is the thing this rail does differently from the other two --
// searching the *prose* rather than the labels. "approve" has to find
// Governance, whose entry says approved minutes and whose name says nothing
// about approving, or the rail answers only the questions the reader could
// already have answered from the section headings.
import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PermissionResourceRow } from "@/components/portal/permission-resource-doc";
import { PermissionReferenceRail } from "./permission-reference-rail";

afterEach(cleanup);

const RESOURCES: PermissionResourceRow[] = [
  {
    key: "finance",
    section: "Finance",
    label: "Finance",
    description: "Donations, expenses, and reimbursements management",
    module_key: "finance",
  },
  {
    key: "finance_approvals",
    section: "Finance",
    label: "Expense approvals",
    description: "Approve, reject, or mark paid any submitted expense",
    module_key: "finance",
  },
  {
    key: "governance",
    section: "Governance",
    label: "Governance",
    description: "Board, meetings, bylaws, policies, and compliance records",
    module_key: "governance",
  },
  {
    key: "reimbursements",
    section: "Finance",
    label: "Reimbursements",
    description: "Personal-spend reimbursement requests",
    module_key: "reimbursements",
  },
];

function renderRail(overrides: { inert?: string[]; onJump?: () => void } = {}) {
  const onJump = overrides.onJump ?? mock(() => {});
  render(
    <PermissionReferenceRail
      device="desktop"
      resources={RESOURCES}
      inertKeys={new Set(overrides.inert ?? [])}
      active="finance"
      onJump={onJump}
    />,
  );
  return { onJump };
}

describe("the permission reference rail", () => {
  test("groups the catalog by section, in catalog order", () => {
    renderRail();

    const nav = screen.getByRole("navigation", { name: "Permissions" });
    // The outer list holds one item per section; each of those holds its own
    // list of resources, which is what `slice(1)` drops the outer one to get.
    const sections = within(nav)
      .getAllByRole("list")
      .slice(1)
      .map((list) =>
        within(list)
          .getAllByRole("button")
          .map((button) => button.textContent),
      );

    expect(sections).toEqual([
      ["Finance", "Expense approvals", "Reimbursements"],
      ["Governance"],
    ]);
  });

  test("marks the resource the reader is looking at", () => {
    renderRail();

    expect(screen.getByRole("button", { name: "Finance" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(
      screen.getByRole("button", { name: "Expense approvals" }),
    ).not.toHaveAttribute("aria-current");
  });

  test("a row asks the page to jump to that resource", async () => {
    const user = userEvent.setup();
    const { onJump } = renderRail();

    await user.click(screen.getByRole("button", { name: "Expense approvals" }));

    expect(onJump).toHaveBeenCalledWith("finance_approvals");
  });

  test("search reaches into what a permission grants, not just its name", async () => {
    const user = userEvent.setup();
    renderRail();

    await user.type(
      screen.getByRole("searchbox", { name: "Search permissions" }),
      "approved minutes",
    );

    const results = screen.getByRole("navigation", { name: "Search results" });
    // Governance's docs entry is the only place that phrase appears -- its
    // label and its description say nothing about minutes. A result row
    // prints the section under the label, hence the doubled word.
    expect(
      within(results)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["GovernanceGovernance"]);
  });

  test("search says when nothing matches", async () => {
    const user = userEvent.setup();
    renderRail();

    await user.type(
      screen.getByRole("searchbox", { name: "Search permissions" }),
      "zzzznothing",
    );

    expect(screen.getByText("Nothing matches.")).toBeInTheDocument();
  });

  test("a resource whose module is off says so", () => {
    renderRail({ inert: ["reimbursements"] });

    const row = screen.getByRole("button", { name: /Reimbursements/ });
    expect(within(row).getByText("Off")).toBeInTheDocument();
  });
});
