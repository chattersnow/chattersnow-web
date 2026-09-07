import { describe, expect, test } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import {
  expectToast,
  hasToast,
  renderWithToaster,
} from "../../../test/toast-testing";
import userEvent from "@testing-library/user-event";
import { runAction, useActionToast } from "./action-toast";

function Harness({
  action,
  options,
}: {
  action: () => Promise<unknown>;
  options: Parameters<typeof runAction>[1];
}) {
  const { isPending, run } = useActionToast();
  return (
    <button
      type="button"
      onClick={() => run(action as () => Promise<{ success: true }>, options)}
    >
      {isPending ? "Saving" : "Save"}
    </button>
  );
}

async function clickSave(
  action: () => Promise<unknown>,
  options: Parameters<typeof runAction>[1],
) {
  const user = userEvent.setup();
  renderWithToaster(<Harness action={action} options={options} />);
  await user.click(screen.getByRole("button", { name: "Save" }));
}

describe("runAction", () => {
  test("announces the success message and passes the result on", async () => {
    await clickSave(async () => ({ success: true }), {
      success: "Meeting date updated.",
    });
    await expectToast("Meeting date updated.");
  });

  test("derives the message from the result so batches can say how many", async () => {
    await clickSave(async () => ({ count: 14 }), {
      success: (result) =>
        `${(result as { count: number }).count} items assigned.`,
    });
    await expectToast("14 items assigned.");
  });

  test("announces the action's own message when it fails", async () => {
    await clickSave(async () => ({ error: "You cannot edit this meeting." }), {
      success: "Meeting saved.",
    });
    await expectToast("You cannot edit this meeting.");
    expect(hasToast("Meeting saved.")).toBe(false);
  });

  test("falls back to the caller's message when the action throws", async () => {
    await clickSave(
      async () => {
        throw new Error("network");
      },
      { success: "Meeting saved.", error: "Could not reach the server." },
    );
    await expectToast("Could not reach the server.");
  });

  test("hands the failure to onError instead, for surfaces with an inline message", async () => {
    const seen: string[] = [];
    await clickSave(async () => ({ error: "Name is required." }), {
      success: "Saved.",
      onError: (message) => seen.push(message),
    });
    await waitFor(() => expect(seen).toEqual(["Name is required."]));
    expect(hasToast("Name is required.")).toBe(false);
  });

  test("reports the outcome to the caller", async () => {
    const ok = await runAction(async () => ({ success: true as const }), {
      success: "Saved.",
    });
    expect(ok).toEqual({ ok: true, data: { success: true } });

    const failed = await runAction(async () => ({ error: "Nope." }), {
      success: "Saved.",
      onError: () => {},
    });
    expect(failed).toEqual({ ok: false, message: "Nope." });
  });
});
