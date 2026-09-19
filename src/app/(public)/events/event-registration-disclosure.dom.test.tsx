import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EventRegistrationDisclosure } from "./event-registration-disclosure";

function renderDisclosure() {
  return render(
    <EventRegistrationDisclosure variant="sheet">
      <form>
        <label htmlFor="first">Name</label>
        <input id="first" />
        <label htmlFor="second">Email</label>
        <input id="second" />
        <button type="submit">Complete registration</button>
      </form>
    </EventRegistrationDisclosure>,
  );
}

describe("EventRegistrationDisclosure", () => {
  test("offers the action without the form behind it", () => {
    renderDisclosure();

    const trigger = screen.getByRole("button", { name: "Register" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("textbox", { name: "Name" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Complete registration" }),
    ).toBeNull();
  });

  test("reveals the form and lands focus on its first field", async () => {
    const user = userEvent.setup();
    renderDisclosure();

    await user.click(screen.getByRole("button", { name: "Register" }));

    const trigger = screen.getByRole("button", { name: "Register" });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const name = screen.getByRole("textbox", { name: "Name" });
    expect(name).toBeVisible();
    expect(document.activeElement).toBe(name);
    // The trigger says which region it governs, so a screen-reader user can
    // jump to what just appeared.
    const panel = document.getElementById(
      trigger.getAttribute("aria-controls") ?? "",
    );
    expect(panel?.contains(name)).toBe(true);
  });

  test("keeps what was typed when the form is collapsed again", async () => {
    const user = userEvent.setup();
    renderDisclosure();

    await user.click(screen.getByRole("button", { name: "Register" }));
    await user.type(screen.getByRole("textbox", { name: "Name" }), "Jane");

    await user.click(screen.getByRole("button", { name: "Register" }));
    expect(screen.queryByRole("textbox", { name: "Name" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Register" }));
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("Jane");
  });
});
