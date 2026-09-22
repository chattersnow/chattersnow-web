import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EMPTY_CONTACT_PREFILL } from "@/lib/constituent/viewer";

// The action module reaches the admin client, which is `server-only`-guarded
// and throws outside Next's bundler. Neutralising the guard lets it load so
// that the mock below can replace its one export; nothing in it runs.
mock.module("server-only", () => ({}));

const requestGearItemsActionMock = mock<
  (itemIds: string[], formData: FormData) => Promise<{ success: true }>
>(async () => ({ success: true }));

mock.module("./gear-cart-request-actions", () => ({
  requestGearItemsAction: requestGearItemsActionMock,
}));

const { GearCartCheckoutForm } = await import("./gear-cart-checkout-form");

const OPTIONS = { shippingEnabled: false, paymentMethods: [] };

/** The FormData the action was last called with, as plain fields. */
function lastSubmission() {
  const call = requestGearItemsActionMock.mock.calls.at(-1);
  if (!call) throw new Error("the request action was never called");
  return Object.fromEntries(call[1].entries()) as Record<string, string>;
}

describe("GearCartCheckoutForm", () => {
  beforeEach(() => {
    requestGearItemsActionMock.mockClear();
  });

  test("a visitor with no session gets the blank form it always had", () => {
    render(
      <GearCartCheckoutForm
        itemIds={["item-1"]}
        options={OPTIONS}
        onSuccess={() => {}}
      />,
    );

    expect(screen.getByLabelText(/^Name/)).toHaveValue("");
    expect(screen.getByLabelText("Instagram")).toHaveValue("");
    expect(screen.queryByText(/Signed in as/)).toBeNull();
  });

  // #1357: the application is already holding this, and asking a signed-in
  // reader to retype it is how a second copy of somebody gets made.
  test("starts a signed-in reader from what their session already holds", () => {
    render(
      <GearCartCheckoutForm
        itemIds={["item-1"]}
        options={OPTIONS}
        onSuccess={() => {}}
        prefill={{
          ...EMPTY_CONTACT_PREFILL,
          name: "Jane Rivers",
          email: "jane@example.com",
          phone: "555-1234",
          instagramHandle: "jane.rivers",
          signedInAs: "jane@example.com",
        }}
      />,
    );

    expect(screen.getByLabelText(/^Name/)).toHaveValue("Jane Rivers");
    expect(screen.getByLabelText(/^Email/)).toHaveValue("jane@example.com");
    expect(screen.getByLabelText("Phone")).toHaveValue("555-1234");
    expect(screen.getByLabelText("Instagram")).toHaveValue("jane.rivers");
    expect(screen.getByText("Signed in as jane@example.com.")).toBeVisible();
  });

  test("submits the handle as typed, @ and all", async () => {
    const user = userEvent.setup();
    render(
      <GearCartCheckoutForm
        itemIds={["item-1"]}
        options={OPTIONS}
        onSuccess={() => {}}
      />,
    );

    await user.type(screen.getByLabelText(/^Name/), "Jane Rivers");
    await user.type(screen.getByLabelText(/^Email/), "jane@example.com");
    await user.type(screen.getByLabelText("Instagram"), "@jane.rivers");
    await user.click(screen.getByRole("button", { name: /Request 1 item/ }));

    // The form does not normalize: parseGearRequestForm strips the @ and
    // refuses what the column would, in one place, on the server.
    expect(lastSubmission().instagram_handle).toBe("@jane.rivers");
  });
});
