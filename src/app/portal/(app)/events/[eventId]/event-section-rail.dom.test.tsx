import { describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { EventSectionRail } from "./event-section-rail";
import type { EventPhase } from "../event-tabs-config";

const PHASES: EventPhase[] = [
  {
    key: "basic",
    label: "Overview",
    tabs: [
      { value: "overview", label: "Event details", keywords: [] },
      { value: "checklist", label: "Checklist", keywords: [] },
    ],
  },
  {
    key: "planning",
    label: "Planning",
    tabs: [
      {
        value: "planning",
        label: "Registration & planning",
        keywords: ["budget", "capacity"],
      },
      { value: "logistics", label: "Logistics", keywords: ["venue"] },
    ],
  },
];

function renderRail(
  overrides: Partial<Parameters<typeof EventSectionRail>[0]> = {},
) {
  const onSelect = mock(() => {});
  render(
    <EventSectionRail
      phases={PHASES}
      current="overview"
      currentTitle="Event details"
      onSelect={onSelect}
      {...overrides}
    />,
  );
  return onSelect;
}

function sections() {
  return within(screen.getByRole("navigation", { name: "Event sections" }));
}

function results() {
  return within(screen.getByRole("navigation", { name: "Search results" }));
}

function search() {
  return screen.getByRole("searchbox", {
    name: "Search this event's sections",
  });
}

describe("EventSectionRail", () => {
  test("lists every section under its group heading", () => {
    renderRail();

    expect(sections().getAllByRole("button")).toHaveLength(4);
    expect(sections().getByText("Overview")).toBeInTheDocument();
    expect(sections().getByText("Planning")).toBeInTheDocument();
    expect(
      sections().getByRole("button", { name: /Registration & planning/ }),
    ).toBeVisible();
  });

  test("marks the open section, and only it", () => {
    renderRail({ current: "logistics" });

    expect(
      sections().getByRole("button", { name: /^Logistics/ }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      sections().getByRole("button", { name: /^Checklist/ }),
    ).not.toHaveAttribute("aria-current");
  });

  test("reports the section picked", () => {
    const onSelect = renderRail();

    fireEvent.click(sections().getByRole("button", { name: /^Checklist/ }));

    expect(onSelect).toHaveBeenCalledWith("checklist");
  });

  test("matches a search on the title", () => {
    renderRail();

    fireEvent.change(search(), { target: { value: "logi" } });

    expect(results().getAllByRole("button")).toHaveLength(1);
    expect(results().getByRole("button", { name: /Logistics/ })).toBeVisible();
  });

  test("matches a search on a keyword the title does not contain", () => {
    // The lookup the phase tabs could not answer: "budget" is on a card
    // called Registration & planning, in a group called Planning.
    renderRail();

    fireEvent.change(search(), { target: { value: "Budget" } });

    expect(
      results().getByRole("button", { name: /Registration & planning/ }),
    ).toBeVisible();
  });

  test("matches a search on the group heading", () => {
    renderRail();

    fireEvent.change(search(), { target: { value: "planning" } });

    expect(results().getAllByRole("button")).toHaveLength(2);
  });

  test("names the group in a result, since the headings are gone", () => {
    renderRail();

    fireEvent.change(search(), { target: { value: "venue" } });

    const row = results().getByRole("button", { name: /^Logistics/ });
    expect(within(row).getByText("Planning")).toBeInTheDocument();
  });

  test("says so when nothing matches", () => {
    renderRail();

    fireEvent.change(search(), { target: { value: "sponsors" } });

    expect(screen.getByText("Nothing matches.")).toBeInTheDocument();
    expect(results().queryAllByRole("button")).toHaveLength(0);
  });

  test("badges a section with outstanding work, and names it", () => {
    renderRail({
      cardTasks: { checklist: ["Return the van", "Send thank-yous"] },
    });

    const row = sections().getByRole("button", { name: /^Checklist/ });
    expect(within(row).getByLabelText("2 outstanding")).toHaveAttribute(
      "title",
      "Return the van, Send thank-yous",
    );
    expect(screen.getAllByLabelText(/outstanding/)).toHaveLength(1);
  });

  test("names the open section on the collapsed rail's button", () => {
    // Below lg the rail is behind a disclosure, and a button reading only
    // "Sections" would leave the reader with nothing saying where they are.
    renderRail({ current: "logistics", currentTitle: "Logistics" });

    const toggle = screen.getByRole("button", { name: "Sections · Logistics" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(toggle);
    expect(
      screen.getByRole("button", { name: "Hide sections" }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  test("collapses again once a section is picked", () => {
    // Below lg the rail sits above the card, so a rail left open would push
    // the section the reader just asked for off the screen.
    const onSelect = renderRail();

    fireEvent.click(screen.getByRole("button", { name: /^Sections · / }));
    fireEvent.click(sections().getByRole("button", { name: /^Checklist/ }));

    expect(onSelect).toHaveBeenCalledWith("checklist");
    expect(
      screen.getByRole("button", { name: /^Sections · / }),
    ).toHaveAttribute("aria-expanded", "false");
  });
});
