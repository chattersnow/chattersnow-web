import { describe, expect, test } from "bun:test";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  DiscardChangesDialog,
  useUnsavedChangesGuard,
} from "./unsaved-changes-guard";

function Harness({ startDirty = false }: { startDirty?: boolean }) {
  const [value, setValue] = useState(startDirty ? "typed" : "");
  const [closed, setClosed] = useState(false);
  const guard = useUnsavedChangesGuard(value !== "");

  return (
    <>
      <DiscardChangesDialog
        guard={guard}
        subject="this expense"
        onDiscard={() => {
          setValue("");
          setClosed(true);
        }}
      />
      <input
        aria-label="Description"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <button
        type="button"
        onClick={() => {
          if (!guard.allowOpenChange(false)) return;
          setClosed(true);
        }}
      >
        Close
      </button>
      {closed && <p>closed</p>}
    </>
  );
}

describe("useUnsavedChangesGuard", () => {
  test("lets an untouched form close without asking", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByText("closed")).toBeInTheDocument();
  });

  test("intercepts the close once something has been typed", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByLabelText("Description"), "Lift tickets");
    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(screen.queryByText("closed")).not.toBeInTheDocument();
    expect(screen.getByText("Discard changes?")).toBeInTheDocument();
  });

  test("Keep editing returns to the form with the work intact", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByLabelText("Description"), "Lift tickets");
    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.click(screen.getByRole("button", { name: "Keep editing" }));

    expect(screen.queryByText("closed")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Description")).toHaveValue("Lift tickets");
  });

  test("Discard changes closes and clears", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByLabelText("Description"), "Lift tickets");
    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.click(screen.getByRole("button", { name: "Discard changes" }));

    expect(screen.getByText("closed")).toBeInTheDocument();
  });

  test("clearing a field back to empty is no longer dirty", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByLabelText("Description");
    await user.type(input, "oops");
    await user.clear(input);
    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(screen.getByText("closed")).toBeInTheDocument();
  });
});
