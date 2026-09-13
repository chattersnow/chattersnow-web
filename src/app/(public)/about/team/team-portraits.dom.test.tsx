import { describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

mock.module("next/image", () => ({
  default: ({ src, alt }: { src: unknown; alt: string }) => (
    <img src={typeof src === "string" ? src : ""} alt={alt} />
  ),
}));

const { TeamPortraits } = await import("./team-portraits");

const ADA_BIO = ["Ada rides most weekends.", "Ada also coaches beginners."];
const BEN_BIO = ["Ben came to the sport late and stayed."];

const MEMBERS = [
  { name: "Ada Lomax", role: "Board chair", bio: ADA_BIO, photoUrl: null },
  { name: "Ben Ortiz", role: "Programs lead", bio: BEN_BIO, photoUrl: null },
  // The live shape of a member nobody has written about yet.
  { name: "Cal Nguyen", role: "Volunteer lead", bio: [], photoUrl: null },
];

function renderPortraits() {
  return render(<TeamPortraits members={MEMBERS} />);
}

/**
 * The `<section>` holding one member's bio, hidden or not.
 *
 * Found through the DOM rather than `getByRole("heading")` deliberately: a
 * hidden panel is correctly absent from the accessibility tree, which is the
 * behaviour these tests are checking, so a role query cannot see the very
 * state they exist to assert.
 */
function panelFor(container: HTMLElement, name: string): HTMLElement {
  const section = Array.from(
    container.querySelectorAll<HTMLElement>("section.team-portrait-bio"),
  ).find((candidate) => candidate.querySelector("h2")?.textContent === name);
  expect(section).toBeDefined();
  return section as HTMLElement;
}

describe("TeamPortraits", () => {
  test("opens as a grid of faces with no bio on screen", () => {
    const { container } = renderPortraits();

    // Name and role appear twice each -- once under the face, once as the
    // heading of the panel that face opens -- so the portrait is queried as
    // the control it is rather than by its text.
    expect(
      screen.getByRole("button", { name: /Ada Lomax/ }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Board chair").length).toBeGreaterThan(0);
    // Every bio is in the markup -- that is the whole point -- but none of
    // them is showing.
    expect(panelFor(container, "Ada Lomax")).toHaveAttribute("hidden");
    expect(panelFor(container, "Ben Ortiz")).toHaveAttribute("hidden");
    for (const button of screen.getAllByRole("button")) {
      expect(button).toHaveAttribute("aria-expanded", "false");
    }
  });

  // The criterion this layout exists to satisfy: a crawler and a reader
  // without JavaScript see every word, because hiding is CSS over markup the
  // server already sent rather than a fetch on click.
  test("renders every paragraph of every bio into the markup", () => {
    renderPortraits();

    for (const paragraph of [...ADA_BIO, ...BEN_BIO]) {
      expect(screen.getByText(paragraph)).toBeInTheDocument();
    }
  });

  test("shows one bio at a time, and swaps it for the next", async () => {
    const user = userEvent.setup();
    const { container } = renderPortraits();

    await user.click(screen.getByRole("button", { name: /Ada Lomax/ }));

    expect(panelFor(container, "Ada Lomax")).not.toHaveAttribute("hidden");
    expect(panelFor(container, "Ben Ortiz")).toHaveAttribute("hidden");
    expect(screen.getByRole("button", { name: /Ada Lomax/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );

    await user.click(screen.getByRole("button", { name: /Ben Ortiz/ }));

    expect(panelFor(container, "Ada Lomax")).toHaveAttribute("hidden");
    expect(panelFor(container, "Ben Ortiz")).not.toHaveAttribute("hidden");
  });

  test("closes again when the open portrait is picked a second time", async () => {
    const user = userEvent.setup();
    const { container } = renderPortraits();

    const ada = screen.getByRole("button", { name: /Ada Lomax/ });
    await user.click(ada);
    expect(panelFor(container, "Ada Lomax")).not.toHaveAttribute("hidden");

    await user.click(screen.getByRole("button", { name: /Ada Lomax/ }));
    expect(panelFor(container, "Ada Lomax")).toHaveAttribute("hidden");
  });

  test("a member with no bio is a portrait, not a control", () => {
    renderPortraits();

    expect(screen.getByText("Cal Nguyen")).toBeInTheDocument();
    expect(screen.getByText("Volunteer lead")).toBeInTheDocument();
    // Two members have bios, so two buttons -- Cal is not one of them.
    expect(screen.getAllByRole("button")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /Cal Nguyen/ })).toBeNull();
  });

  test("points each portrait at the panel it opens", async () => {
    const user = userEvent.setup();
    const { container } = renderPortraits();

    const ada = screen.getByRole("button", { name: /Ada Lomax/ });
    expect(ada.getAttribute("aria-controls")).toBe(
      panelFor(container, "Ada Lomax").id,
    );

    // Keyboard reaches it the same way a pointer does: it is a real button.
    ada.focus();
    await user.keyboard("{Enter}");
    expect(panelFor(container, "Ada Lomax")).not.toHaveAttribute("hidden");
  });
});
