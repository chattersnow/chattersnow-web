import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  EventRegistrationDisclosure,
  useCloseRegistration,
} from "./event-registration-disclosure";

/** Stands in for the steps' Cancel, which closes through the same hook. */
function CancelButton() {
  const close = useCloseRegistration();
  return (
    <button type="button" onClick={() => close?.()}>
      Cancel
    </button>
  );
}

function renderDisclosure() {
  return render(
    <EventRegistrationDisclosure eventName="Winter Gear Swap">
      <form>
        <label htmlFor="first">Name</label>
        <input id="first" />
        <label htmlFor="second">Email</label>
        <input id="second" />
        <CancelButton />
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

  test("gives way to the form, headed for the event, and lands focus on its first field", async () => {
    const user = userEvent.setup();
    renderDisclosure();

    const trigger = screen.getByRole("button", { name: "Register" });
    const panelId = trigger.getAttribute("aria-controls") ?? "";
    await user.click(trigger);

    // #1427: the button does not stand over the form it opened.
    expect(screen.queryByRole("button", { name: "Register" })).toBeNull();
    const region = screen.getByRole("region", {
      name: "Register for Winter Gear Swap",
    });
    expect(region.id).toBe(panelId);
    const name = screen.getByRole("textbox", { name: "Name" });
    expect(name).toBeVisible();
    expect(region.contains(name)).toBe(true);
    expect(document.activeElement).toBe(name);
  });

  test("Cancel puts the form away, hands focus back to Register, and keeps what was typed", async () => {
    const user = userEvent.setup();
    renderDisclosure();

    await user.click(screen.getByRole("button", { name: "Register" }));
    await user.type(screen.getByRole("textbox", { name: "Name" }), "Jane");

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("textbox", { name: "Name" })).toBeNull();
    const trigger = screen.getByRole("button", { name: "Register" });
    expect(document.activeElement).toBe(trigger);

    await user.click(trigger);
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("Jane");
  });
});
