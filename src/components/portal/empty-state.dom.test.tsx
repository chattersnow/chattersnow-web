import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { EmptyState } from "./empty-state";

describe("EmptyState", () => {
  test("renders the title, the next step, and the action", () => {
    render(
      <EmptyState
        title="No events yet"
        description="Create the first one to start planning."
        action={<button type="button">New event</button>}
      />,
    );
    expect(screen.getByText("No events yet")).toBeTruthy();
    expect(
      screen.getByText("Create the first one to start planning."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "New event" })).toBeTruthy();
  });

  test("omits the description and action when not given", () => {
    const { container } = render(<EmptyState title="No hours logged yet" />);
    expect(
      container.querySelector('[data-slot="empty-description"]'),
    ).toBeNull();
    expect(container.querySelector('[data-slot="empty-content"]')).toBeNull();
  });
});
