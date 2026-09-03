import { describe, expect, test } from "bun:test";
import { render } from "@testing-library/react";
import {
  HistoryCard,
  HistoryGroups,
  HistoryItem,
  HistoryList,
  HistorySection,
} from "./history-card";

function titleOf(container: HTMLElement) {
  // textContent rather than getByText: the title is split across text nodes
  // (name, count, suffix), which getByText won't match as one string.
  return container.querySelector('[data-slot="card-title"]')!.textContent;
}

function renderCard(props: Partial<Parameters<typeof HistoryCard>[0]> = {}) {
  return render(
    <HistoryCard
      title="Donations"
      count={3}
      emptyTitle="No donations recorded"
      emptyDescription="Gear donations appear here."
      {...props}
    >
      <HistoryList>
        <HistoryItem primary="An entry" />
      </HistoryList>
    </HistoryCard>,
  );
}

// e2e locates these cards with [data-slot="card"] + hasText, so the rendered
// titles are a contract, not cosmetics. These are the exact strings the
// detail page produced before the registry.
describe("HistoryCard titles", () => {
  test("appends the count", () => {
    expect(titleOf(renderCard().container)).toBe("Donations (3)");
    expect(
      titleOf(renderCard({ title: "Sponsorships", count: 2 }).container),
    ).toBe("Sponsorships (2)");
  });

  test("places a suffix after the count", () => {
    const { container } = renderCard({
      title: "Event registrations",
      count: 4,
      titleSuffix: <> · Attended 2</>,
    });
    expect(titleOf(container)).toBe("Event registrations (4) · Attended 2");
  });

  test("omits the count entirely for aggregating cards", () => {
    const { container } = renderCard({
      title: "Volunteer activity",
      count: undefined,
      isEmpty: false,
    });
    expect(titleOf(container)).toBe("Volunteer activity");
  });
});

describe("HistoryCard body", () => {
  test("shows the empty state and no entries when the count is zero", () => {
    const { container, queryByText } = renderCard({ count: 0 });
    expect(queryByText("No donations recorded")).not.toBeNull();
    expect(queryByText("An entry")).toBeNull();
    expect(container.querySelector("ul")).toBeNull();
  });

  test("isEmpty overrides the count for cards that aggregate", () => {
    // Several result sets decide emptiness, so a countless card must be able
    // to say so directly.
    const { queryByText } = renderCard({
      count: undefined,
      isEmpty: true,
    });
    expect(queryByText("No donations recorded")).not.toBeNull();
  });

  test("renders actions in a footer only when given", () => {
    const without = renderCard();
    expect(
      without.container.querySelector('[data-slot="card-footer"]'),
    ).toBeNull();

    const { container, queryByText } = renderCard({
      actions: <a href="/portal/finance/donations">Money donations</a>,
    });
    expect(container.querySelector('[data-slot="card-footer"]')).not.toBeNull();
    expect(queryByText("Money donations")).not.toBeNull();
  });

  test("an actions slot that gated everything away adds no footer", () => {
    // AspectActions returns null when no action passes, so the card must not
    // render an empty footer for a viewer with no module permissions.
    const { container } = renderCard({ actions: null });
    expect(container.querySelector('[data-slot="card-footer"]')).toBeNull();
  });
});

describe("HistorySection", () => {
  test("renders nothing when its set is empty", () => {
    const { queryByText } = render(
      <HistoryGroups>
        <HistorySection title="Applications" isEmpty>
          <li>Never shown</li>
        </HistorySection>
        <HistorySection title="Hours logged (4)" isEmpty={false}>
          <li>Shown</li>
        </HistorySection>
      </HistoryGroups>,
    );
    expect(queryByText("Applications")).toBeNull();
    expect(queryByText("Hours logged (4)")).not.toBeNull();
    expect(queryByText("Shown")).not.toBeNull();
  });
});
