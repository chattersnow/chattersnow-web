import { describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PersonActionResult } from "./actions";
import * as PeopleActions from "./actions";

const createPersonActionMock = mock(async (): Promise<PersonActionResult> => ({
  error: "not under test",
}));

mock.module("./actions", () => ({
  ...PeopleActions,
  createPersonAction: createPersonActionMock,
}));

const { NewPersonDialog } = await import("./new-person-dialog");

/**
 * Fires the event a browser sends before a full-document navigation and
 * reports whether anything asked it to prompt. The directory's search form
 * is such a navigation, so a guard armed here is a guard that blocks search.
 */
function leaveSiteWouldPrompt() {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

describe("NewPersonDialog", () => {
  test("does not arm the leave-site prompt while closed", () => {
    // Regression: the dirty check compared the nested `roles` object by
    // reference, so a never-opened dialog counted as unsaved work and every
    // GET form on the people pages hit a "Leave site?" prompt.
    render(<NewPersonDialog people={[]} defaultRole="is_sponsor" />);
    expect(leaveSiteWouldPrompt()).toBe(false);
  });

  test("arms the leave-site prompt only once something has been typed", async () => {
    const user = userEvent.setup();
    render(<NewPersonDialog people={[]} />);

    await user.click(screen.getByRole("button", { name: "New Person" }));
    expect(leaveSiteWouldPrompt()).toBe(false);

    await user.type(screen.getByLabelText(/^Name/), "Jane");
    expect(leaveSiteWouldPrompt()).toBe(true);
  });
});
