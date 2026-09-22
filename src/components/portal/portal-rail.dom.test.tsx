import { describe, expect, mock, test } from "bun:test";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PortalRail, PortalRailResults } from "./portal-rail";
import type { DeviceClass } from "@/proxy";

const ENTRIES = ["Overview", "Logistics", "Sponsors"];

function renderRail(
  device: DeviceClass,
  { onPick = () => {} }: { onPick?: (entry: string) => void } = {},
) {
  render(
    <PortalRail
      id="test-rail"
      device={device}
      label="Sections · Overview"
      hideLabel="Hide sections"
      title="Sections"
      description="Every part of this thing."
      searchLabel="Search sections"
      searchPlaceholder="Search"
    >
      {({ query, close }) => {
        const matches = ENTRIES.filter((entry) =>
          entry.toLowerCase().includes(query),
        );
        const rows = (
          <ul>
            {(query ? matches : ENTRIES).map((entry) => (
              <li key={entry}>
                <button
                  type="button"
                  onClick={() => close(() => onPick(entry))}
                >
                  {entry}
                </button>
              </li>
            ))}
          </ul>
        );
        return query ? (
          <PortalRailResults count={matches.length} noun="section">
            {rows}
          </PortalRailResults>
        ) : (
          <nav aria-label="Sections">{rows}</nav>
        );
      }}
    </PortalRail>,
  );
}

function search() {
  return screen.getByRole("searchbox", { name: "Search sections" });
}

describe("PortalRail above lg", () => {
  test("keeps the column, with the disclosure for a narrower window", () => {
    renderRail("desktop");

    const toggle = screen.getByRole("button", { name: "Sections · Overview" });
    expect(toggle).toHaveAttribute("aria-controls", "test-rail");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    // No overlay: the rail is the column beside the page, already rendered.
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("navigation", { name: "Sections" })).toBeVisible();

    fireEvent.click(toggle);
    expect(
      screen.getByRole("button", { name: "Hide sections" }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  test("hands the caller the query, trimmed and lower-cased", () => {
    renderRail("desktop");

    fireEvent.change(search(), { target: { value: "  SPON " } });

    const results = within(
      screen.getByRole("navigation", { name: "Search results" }),
    );
    expect(results.getByText("1 section")).toBeInTheDocument();
    expect(results.getByRole("button", { name: "Sponsors" })).toBeVisible();
  });

  test("runs a pick's follow-up straight away, with no sheet to wait for", () => {
    const picked: string[] = [];
    const onPick = (entry: string) => picked.push(entry);
    renderRail("desktop", { onPick });

    fireEvent.click(screen.getByRole("button", { name: "Logistics" }));

    expect(picked).toEqual(["Logistics"]);
  });
});

describe("PortalRail on a phone", () => {
  test("puts the list in a sheet rather than above the page", async () => {
    const user = userEvent.setup();
    renderRail("mobile");

    // Nothing of the rail is on the page until it is asked for, so opening it
    // cannot push the card the reader is working on down the screen.
    expect(screen.queryByRole("navigation", { name: "Sections" })).toBeNull();
    await user.click(
      screen.getByRole("button", { name: "Sections · Overview" }),
    );

    const sheet = within(await screen.findByRole("dialog"));
    expect(sheet.getByText("Sections")).toBeInTheDocument();
    expect(
      sheet.getByRole("searchbox", { name: "Search sections" }),
    ).toBeVisible();
    expect(sheet.getByRole("navigation", { name: "Sections" })).toBeVisible();
  });

  test("closes on a pick and only then runs the follow-up", async () => {
    // The order is the point: a modal sheet holds the page's scroll and
    // restores it as it closes, so a jump run beside the close is undone.
    const user = userEvent.setup();
    const order: string[] = [];
    const onPick = mock((entry: string) => order.push(`picked ${entry}`));
    renderRail("mobile", { onPick });

    await user.click(screen.getByRole("button", { name: /^Sections · / }));
    const sheet = await screen.findByRole("dialog");
    await user.click(within(sheet).getByRole("button", { name: "Sponsors" }));

    // Retried rather than sampled (#1294). This read the absence on the line
    // after the click, which holds only while the close is synchronous with
    // React's flush -- Base UI unmounts the sheet behind
    // `useAnimationsFinished`, so what makes it pass today is happy-dom having
    // no real animations rather than anything this test is asserting.
    // (`waitForElementToBeRemoved` is the wrong tool here: it refuses an
    // element that has already gone, which under happy-dom is every run.)
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(order).toEqual(["picked Sponsors"]);
  });
});
