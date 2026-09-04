import { describe, expect, test } from "bun:test";
import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";
import { Dialog, DialogContent } from "./dialog";

function Harness() {
  const [value, setValue] = useState<string | null>(null);
  return (
    <Select value={value} onValueChange={(next) => setValue(next ?? null)}>
      <SelectTrigger aria-label="Method">
        <SelectValue placeholder="Pick one" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="cash">Cash</SelectItem>
        <SelectItem value="check">Check</SelectItem>
        <SelectItem value="card">Card</SelectItem>
      </SelectContent>
    </Select>
  );
}

// Issue #567 was reported as "dropdown selects are not keyboard-operable".
// The shared Select turned out to be upstream shadcn over Base UI and fine,
// but nothing in the repo held that in place -- the only keyboard assertions
// anywhere were five Escape presses. These are the guard.
describe("Select keyboard operation", () => {
  test("opens, selects with the keyboard, and hands focus back", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const trigger = screen.getByRole("combobox", { name: "Method" });
    trigger.focus();

    await user.keyboard("{Enter}");
    await screen.findByRole("listbox");

    // Opening already highlights the first option, so one ArrowDown lands on
    // the second.
    await user.keyboard("{ArrowDown}{Enter}");

    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
    expect(trigger.textContent).toContain("Check");
    // Leaving focus on a popup that just unmounted drops it to <body>, which
    // strands a keyboard user at the top of the page.
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  test("Escape closes without selecting and returns focus", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const trigger = screen.getByRole("combobox", { name: "Method" });
    trigger.focus();
    await user.keyboard("{Enter}");
    await screen.findByRole("listbox");

    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
    expect(trigger.textContent).toContain("Pick one");
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  test("works inside a dialog, where most portal selects live", async () => {
    const user = userEvent.setup();
    render(
      <Dialog open>
        <DialogContent title="Record donation">
          <Harness />
        </DialogContent>
      </Dialog>,
    );

    const trigger = screen.getByRole("combobox", { name: "Method" });
    trigger.focus();
    await user.keyboard("{Enter}");
    await screen.findByRole("listbox");

    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");

    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
    expect(trigger.textContent).toContain("Card");
    // The first Escape belongs to the select; the dialog must survive it.
    expect(screen.queryByRole("dialog")).not.toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});
