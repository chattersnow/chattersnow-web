// The first-login tour names sections, and since #903 it may only name the
// ones this reader will actually find.
//
// Before that, a tenant whose Inventory module was never sold got a welcome
// dialog opening "events, donations, inventory, finances, governance,
// volunteers, and the content calendar" -- advertising a gear library with no
// sidebar entry, no route and no way in. The sidebar and the dashboard avoid
// that for free by reading my_permissions(); this copy was a string.
import { describe, expect, test } from "bun:test";
import { render } from "@testing-library/react";
import type { PermissionLevel, PermissionMap } from "@/lib/auth/permissions";
import { welcomeSteps } from "./welcome-steps";

const EVERYTHING: PermissionMap = Object.fromEntries(
  [
    "events",
    "inventory",
    "inventory_intake",
    "finance",
    "finance_approvals",
    "governance",
    "volunteers",
    "programs",
    "content_calendar",
    "communications",
  ].map((resource) => [resource, "manage" as PermissionLevel]),
);

function without(...resources: string[]): PermissionMap {
  const map = { ...EVERYTHING };
  for (const resource of resources) map[resource] = "none";
  return map;
}

/** The rendered text of one step, whitespace-collapsed. */
function textOf(permissions: PermissionMap, key: string): string {
  const step = welcomeSteps(permissions).find(
    (candidate) => candidate.key === key,
  )!;
  const { container } = render(<div>{step.body}</div>);
  return (container.textContent ?? "").replace(/\s+/g, " ");
}

describe("welcomeSteps", () => {
  test("is the same four steps whatever the reader holds", () => {
    // The sections are gated inside the copy rather than by dropping steps:
    // all four describe the shell, which every reader gets.
    expect(welcomeSteps({}).map((step) => step.key)).toEqual([
      "welcome",
      "navigation",
      "help",
      "notifications",
    ]);
  });

  test("names every section for an admin holding everything", () => {
    const opening = textOf(EVERYTHING, "welcome");
    for (const section of [
      "events",
      "inventory",
      "finances",
      "governance",
      "volunteers",
      "programs",
      "the content calendar",
    ]) {
      expect(opening).toContain(section);
    }
  });

  test("does not name a section this reader cannot reach", () => {
    const opening = textOf(without("inventory", "finance"), "welcome");
    expect(opening).not.toContain("inventory");
    expect(opening).not.toContain("finances");
    expect(opening).toContain("events");
    expect(opening).toContain("governance");
  });

  test("offers at most two quick-action examples, and only real ones", () => {
    // buildQuickActions() gates the New event button on events:manage, so a
    // reader with only events:view must not be told about it.
    const viewer = textOf({ events: "view", inventory: "view" }, "navigation");
    expect(viewer).not.toContain("creating an event");
    expect(viewer).toContain("quick actions you're allowed to take");

    const admin = textOf(EVERYTHING, "navigation");
    expect(admin).toContain("creating an event");
    expect(admin).toContain("logging a donation");
    // Capped at two: the sentence is an illustration, not an inventory.
    expect(admin).not.toContain("recording a gear donation");
  });

  test("lists only the attention items this reader's bell can show", () => {
    const step = textOf(
      without("volunteers", "communications"),
      "notifications",
    );
    expect(step).not.toContain("new volunteer applications");
    expect(step).not.toContain("contact messages");
    expect(step).toContain("attendees still to check in");
  });

  test("still reads as a sentence when nothing survives the gates", () => {
    // A reader whose access is narrow enough to empty a list gets a sentence
    // with no list rather than a sentence with a hole in it.
    const opening = textOf({}, "welcome");
    expect(opening).toContain(
      "This is where your organization's work gets tracked.",
    );
    expect(opening).not.toContain("—");

    const bell = textOf({}, "notifications");
    expect(bell).toContain(
      "gathers the work that is waiting on you specifically.",
    );
  });
});
