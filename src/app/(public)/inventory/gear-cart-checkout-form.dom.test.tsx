import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EMPTY_CONTACT_PREFILL } from "@/lib/constituent/viewer";

// The action module reaches the admin client, which is `server-only`-guarded
// and throws outside Next's bundler. Neutralising the guard lets it load so
// that the mock below can replace its one export; nothing in it runs.
mock.module("server-only", () => ({}));

const REQUEST_ID = "22222222-2222-4222-8222-222222222222";

const requestGearItemsActionMock = mock<
  (
    itemIds: string[],
    formData: FormData,
  ) => Promise<{ success: true; requestId: string }>
>(async () => ({ success: true, requestId: REQUEST_ID }));

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

  const LINKED = {
    ...EMPTY_CONTACT_PREFILL,
    name: "Jane Rivers",
    email: "jane@example.com",
    phone: "555-1234",
    instagramHandle: "jane.rivers",
    signedInAs: "jane@example.com",
    linked: true,
  };

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

  // #1359: a reader with a record of their own requests as that record, so
  // the contact fields decide nothing. Showing them as inputs would invite a
  // correction the request has nowhere to put.
  test("shows a linked reader their own record instead of asking for it", () => {
    render(
      <GearCartCheckoutForm
        itemIds={["item-1"]}
        options={OPTIONS}
        onSuccess={() => {}}
        prefill={LINKED}
      />,
    );

    expect(
      screen.getByText(/Requesting as Jane Rivers \(jane@example.com\)/),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Not you, or out of date?" }),
    ).toHaveAttribute("href", "/my/details");
    expect(screen.queryByLabelText(/^Name/)).toBeNull();
    expect(screen.queryByLabelText(/^Email/)).toBeNull();
    expect(screen.queryByLabelText("Instagram")).toBeNull();
    // The one line about the session is redundant beside the line above, and
    // saying both would say the same thing twice.
    expect(screen.queryByText(/Signed in as/)).toBeNull();
  });

  test("sends a linked reader's request with no contact fields on it", async () => {
    const user = userEvent.setup();
    render(
      <GearCartCheckoutForm
        itemIds={["item-1"]}
        options={OPTIONS}
        onSuccess={() => {}}
        prefill={LINKED}
      />,
    );

    await user.type(screen.getByLabelText("Notes"), "A 9.5 works too.");
    await user.click(screen.getByRole("button", { name: /Request 1 item/ }));

    expect(lastSubmission()).toEqual({
      notes: "A 9.5 works too.",
      delivery_method: "meetup",
    });
  });

  // The receipt's offer to keep the request is authorized by this id (#1359),
  // so it has to survive the hand-off from the action to the cart.
  test("hands the new request's id to the cart", async () => {
    const user = userEvent.setup();
    const onSuccess = mock(() => {});
    render(
      <GearCartCheckoutForm
        itemIds={["item-1"]}
        options={OPTIONS}
        onSuccess={onSuccess}
      />,
    );

    await user.type(screen.getByLabelText(/^Name/), "Jane Rivers");
    await user.type(screen.getByLabelText(/^Email/), "jane@example.com");
    await user.click(screen.getByRole("button", { name: /Request 1 item/ }));

    expect(onSuccess).toHaveBeenCalledWith("meetup", REQUEST_ID);
  });
});
