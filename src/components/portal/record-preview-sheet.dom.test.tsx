import { describe, expect, test } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  RecordPreviewLink,
  RecordPreviewProvider,
  useRecordPreview,
} from "./record-preview-sheet";
import type {
  RecordPreview,
  RecordPreviewLoaders,
} from "@/lib/portal/record-preview";
import { pinTimezone } from "@/../test/timezone";

// The viewer is in New York and the event is in Denver, which is the case the
// sheet exists to keep straight: 7pm MDT is 9pm to the reader, and the minutes
// are recording which evening the event is on.
pinTimezone("America/New_York");

const eventPreview: RecordPreview = {
  kind: "event",
  id: "event-1",
  title: "Riverside Community meetup",
  startsAt: "2026-03-14T01:00:00.000Z",
  endsAt: null,
  timeZone: "America/Denver",
  location: "Riverside Park",
  statusLabel: "Published",
  statusTone: "progress",
  summary: "Bring gear to lend.",
  figures: [
    { label: "Registered", value: "42" },
    { label: "Budget", value: "$1,200.00" },
  ],
  href: "/portal/events/event-1",
};

function loaders(
  result: Awaited<ReturnType<NonNullable<RecordPreviewLoaders["event"]>>>,
): RecordPreviewLoaders {
  return { event: async () => result };
}

/** Stands in for the minutes' Reference button, which opens the host panel. */
function HostTrigger() {
  const preview = useRecordPreview();
  if (!preview?.hasHost) return null;
  return (
    <button
      type="button"
      onClick={(event) => preview.openHost(event.currentTarget)}
    >
      Reference
    </button>
  );
}

function Harness({
  loaders: given,
  forbiddenKinds = [],
  host,
}: {
  loaders: RecordPreviewLoaders;
  forbiddenKinds?: ("event" | "calendar_item")[];
  host?: { title: string; description: string; body: React.ReactNode };
}) {
  return (
    <RecordPreviewProvider
      loaders={given}
      forbiddenKinds={forbiddenKinds}
      host={host}
    >
      <HostTrigger />
      <RecordPreviewLink
        record={{ kind: "event", id: "event-1", label: "Riverside meetup" }}
        href="/portal/events/event-1"
      />
    </RecordPreviewProvider>
  );
}

describe("RecordPreviewSheet", () => {
  test("opens the record over the page, in its own timezone, with a link to the full record", async () => {
    const user = userEvent.setup();
    render(<Harness loaders={loaders({ data: eventPreview })} />);

    await user.click(screen.getByRole("button", { name: "Riverside meetup" }));

    // The title is the record's own name, not the label the link carried:
    // a swapping sheet body that keeps announcing the panel it replaced tells
    // a screen reader the wrong thing.
    expect(
      await screen.findByRole("heading", {
        name: "Riverside Community meetup",
      }),
    ).toBeVisible();
    expect(screen.getByText("Event")).toBeVisible();
    expect(screen.getByText(/Mar 13, 2026 at 7:00 PM MDT/)).toBeVisible();
    // The viewer's own clock is the second line, never the only one.
    expect(
      screen.getByText((_, element) =>
        (element?.textContent ?? "").startsWith(
          "Mar 13, 2026 at 9:00 PM EDT your time",
        ),
      ),
    ).toBeVisible();
    expect(screen.getByText("Riverside Park")).toBeVisible();
    expect(screen.getByText("Published")).toBeVisible();
    expect(screen.getByText("42")).toBeVisible();
    expect(screen.getByText("$1,200.00")).toBeVisible();
    expect(screen.getByText("Bring gear to lend.")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Open full record" }),
    ).toHaveAttribute("href", "/portal/events/event-1");
  });

  test("renders a loader refusal as a message rather than an empty sheet", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        loaders={loaders({
          error: {
            code: "forbidden",
            message: "You do not have permission to view events.",
          },
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Riverside meetup" }));

    expect(
      await screen.findByText("You do not have permission to view events."),
    ).toBeVisible();
    expect(screen.queryByRole("link", { name: "Open full record" })).toBeNull();
  });

  test("renders a forbidden kind as plain text, not a link that can only refuse", () => {
    render(
      <Harness
        loaders={loaders({ data: eventPreview })}
        forbiddenKinds={["event"]}
      />,
    );

    expect(screen.getByText("Riverside meetup")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Riverside meetup" }),
    ).toBeNull();
    expect(screen.queryByRole("link", { name: "Riverside meetup" })).toBeNull();
  });

  test("closing returns focus to the reference that opened it", async () => {
    const user = userEvent.setup();
    render(<Harness loaders={loaders({ data: eventPreview })} />);

    const trigger = screen.getByRole("button", { name: "Riverside meetup" });
    await user.click(trigger);
    await screen.findByRole("heading", { name: "Riverside Community meetup" });

    await user.click(screen.getByRole("button", { name: "Close" }));

    await waitFor(() => expect(trigger).toHaveFocus());
  });

  test("on a phone the host panel's body is replaced, and the back button restores it", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        loaders={loaders({ data: eventPreview })}
        host={{
          title: "Quick reference",
          description: "Without leaving the minutes.",
          body: <p>Who is here</p>,
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Riverside meetup" }));
    await screen.findByRole("heading", { name: "Riverside Community meetup" });
    // One sheet, not two: the host's body is gone rather than behind a second
    // backdrop, and there is nothing to go back to from a record opened off
    // the page.
    expect(screen.queryByText("Who is here")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Back to/ })).toBeNull();
  });

  // A reference *inside* the host panel is the case the swap exists for: the
  // page behind an open sheet is inert, so nothing on it can open a second one,
  // and a panel that carries its own references would otherwise stack sheet on
  // sheet. Nothing in the minutes' quick reference links a record today, which
  // is why this is asserted here rather than in `minutes-tab.dom.test.tsx`.
  test("a record opened from the host panel replaces its body, and back restores it", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        loaders={loaders({ data: eventPreview })}
        host={{
          title: "Quick reference",
          description: "Without leaving the minutes.",
          body: (
            <>
              <p>Who is here</p>
              <RecordPreviewLink
                record={{
                  kind: "event",
                  id: "event-1",
                  label: "Riverside meetup",
                }}
                href="/portal/events/event-1"
              />
            </>
          ),
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Reference" }));
    expect(await screen.findByText("Who is here")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Riverside meetup" }));
    expect(
      await screen.findByRole("heading", {
        name: "Riverside Community meetup",
      }),
    ).toBeVisible();
    expect(screen.queryByText("Who is here")).toBeNull();

    await user.click(
      screen.getByRole("button", { name: "Back to Quick reference" }),
    );
    expect(await screen.findByText("Who is here")).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Riverside Community meetup" }),
    ).toBeNull();
  });
});
