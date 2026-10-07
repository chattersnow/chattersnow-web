import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DEFAULT_LEXICON } from "@/lib/lexicon";
import { GEAR_PASSPHRASE_WRONG } from "@/lib/gear-passphrase";

// See gear-cart-checkout-form.dom.test.tsx: the guard is neutralised so the
// action module can load for the mock below to replace.
mock.module("server-only", () => ({}));

const checkGearPassphraseActionMock = mock<
  (passphrase: string) => Promise<{ success: true } | { error: string }>
>(async (passphrase) =>
  passphrase.trim().toLowerCase() === "bluebird"
    ? { success: true }
    : { error: GEAR_PASSPHRASE_WRONG },
);

mock.module("./gear-cart-request-actions", () => ({
  checkGearPassphraseAction: checkGearPassphraseActionMock,
  requestGearItemsAction: async () => ({ error: "unused" }),
}));

const { GearPassphraseDialog } = await import("./gear-passphrase-dialog");

function renderDialog(
  props: Partial<Parameters<typeof GearPassphraseDialog>[0]> = {},
) {
  const onUnlocked = mock(() => {});
  render(
    <GearPassphraseDialog
      open
      onOpenChange={() => {}}
      onUnlocked={onUnlocked}
      organizationName="Example Nonprofit"
      lexicon={DEFAULT_LEXICON}
      helpText=""
      contact={{ kind: "page", href: "/contact" }}
      {...props}
    />,
  );
  return { onUnlocked };
}

describe("GearPassphraseDialog (#1536)", () => {
  beforeEach(() => {
    checkGearPassphraseActionMock.mockClear();
  });

  test("names the organization and points at how to get the passphrase", () => {
    renderDialog({ helpText: "Ask your caseworker." });

    expect(
      screen.getByRole("dialog", { name: "Enter the passphrase" }),
    ).toBeTruthy();
    expect(
      screen.getByText(/Example Nonprofit shares a passphrase/),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Contact us" }).getAttribute("href"),
    ).toBe("/contact");
    expect(screen.getByText("Ask your caseworker.")).toBeTruthy();
    // Required, and marked so (#1070).
    expect(screen.getByLabelText(/Passphrase/).hasAttribute("required")).toBe(
      true,
    );
  });

  test("falls back to the public email where there is no contact page", () => {
    renderDialog({ contact: { kind: "email", address: "hello@example.org" } });
    expect(
      screen.getByRole("link", { name: "Contact us" }).getAttribute("href"),
    ).toBe("mailto:hello@example.org");
  });

  test("a wrong passphrase stays locked and says so", async () => {
    const { onUnlocked } = renderDialog();
    await userEvent.type(screen.getByLabelText(/Passphrase/), "Redbird");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByText(GEAR_PASSPHRASE_WRONG)).toBeTruthy();
    expect(onUnlocked).not.toHaveBeenCalled();
  });

  // Keeping the word is the action's job, in an httpOnly cookie: nothing
  // here may hold it where page scripts can read it.
  test("the right one unlocks the cart, keeping nothing in the page", async () => {
    const { onUnlocked } = renderDialog();
    await userEvent.type(screen.getByLabelText(/Passphrase/), " BlueBird ");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(checkGearPassphraseActionMock).toHaveBeenCalledWith(" BlueBird ");
    await screen.findByRole("dialog");
    expect(onUnlocked).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.length).toBe(0);
    expect(window.localStorage.length).toBe(0);
  });
});
