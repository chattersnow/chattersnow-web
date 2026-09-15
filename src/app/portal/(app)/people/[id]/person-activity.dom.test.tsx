import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockUrlTabState } from "../../../../../../test/url-tab-state-mock";
import type { ActivitySection } from "./person-activity";

mockUrlTabState();

const { PersonActivity } = await import("./person-activity");

function sections(...keys: string[]): ActivitySection[] {
  return keys.map((key) => ({
    key: key as ActivitySection["key"],
    label: key,
    panel: <p>{key} history</p>,
  }));
}

describe("PersonActivity", () => {
  test("renders nothing when the person holds no roles", () => {
    const { container } = render(<PersonActivity sections={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  // Most people in a directory hold exactly one role, and a tab bar with a
  // single tab is a control that cannot do anything.
  test("renders the panel bare when there is only one role", () => {
    render(<PersonActivity sections={sections("is_donor")} />);

    expect(screen.getByText("is_donor history")).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  });

  test("opens the first role and mounts only that panel", () => {
    render(<PersonActivity sections={sections("is_donor", "is_volunteer")} />);

    expect(screen.getByRole("tablist")).toBeInTheDocument();
    expect(screen.getByText("is_donor history")).toBeInTheDocument();
    // Base UI unmounts the inactive panel, which is what keeps every role's
    // markup from being on the page at once (#1108).
    expect(screen.queryByText("is_volunteer history")).not.toBeInTheDocument();
  });

  test("gives every role the person holds a tab", () => {
    render(
      <PersonActivity
        sections={sections("is_donor", "is_volunteer", "is_recipient")}
      />,
    );

    expect(screen.getAllByRole("tab")).toHaveLength(3);
  });

  test("switching tabs swaps the panel", async () => {
    const user = userEvent.setup();
    render(<PersonActivity sections={sections("is_donor", "is_volunteer")} />);

    await user.click(screen.getByRole("tab", { name: "is_volunteer" }));

    expect(screen.getByText("is_volunteer history")).toBeInTheDocument();
    expect(screen.queryByText("is_donor history")).not.toBeInTheDocument();
  });
});
