import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EMPTY_CONTACT_PREFILL } from "@/lib/constituent/viewer";
import { DEFAULT_LEXICON } from "@/lib/lexicon";

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

/** The box every request has to carry since #1367. */
const AS_IS = /I understand the items are given as-is/;

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

  /** Tick the as-is box, which every path has to do before submitting. */
  const acknowledge = (user: ReturnType<typeof userEvent.setup>) =>
    user.click(screen.getByRole("checkbox", { name: AS_IS }));

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
    await acknowledge(user);
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
    await acknowledge(user);
    await user.click(screen.getByRole("button", { name: /Request 1 item/ }));

    // The acknowledgement is here and the contact fields are not: it belongs
    // to the request, and holding an account is not agreement to anything.
    expect(lastSubmission()).toEqual({
      notes: "A 9.5 works too.",
      as_is_acknowledged: "true",
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
    await acknowledge(user);
    await user.click(screen.getByRole("button", { name: /Request 1 item/ }));

    expect(onSuccess).toHaveBeenCalledWith("meetup", REQUEST_ID);
  });

  // #1367. The one box on this form that carries a real choice, and the
  // difference from the privacy notice beside it: declining "I understand
  // this is given as-is" is declining the gear.
  describe("the as-is acknowledgement", () => {
    test("starts unticked and is required, on every path", () => {
      for (const prefill of [EMPTY_CONTACT_PREFILL, LINKED]) {
        const view = render(
          <GearCartCheckoutForm
            itemIds={["item-1"]}
            options={OPTIONS}
            onSuccess={() => {}}
            prefill={prefill}
          />,
        );

        const box = screen.getByRole("checkbox", { name: AS_IS });
        expect(box).not.toBeChecked();
        expect(box).toBeRequired();
        // The words above it, which are also the terms-of-use section.
        expect(
          screen.getByText(/We give away items exactly as they reach us/),
        ).toBeVisible();
        view.unmount();
      }
    });

    test("does not submit while the box is untouched", async () => {
      const user = userEvent.setup();
      render(
        <GearCartCheckoutForm
          itemIds={["item-1"]}
          options={OPTIONS}
          onSuccess={() => {}}
          prefill={LINKED}
        />,
      );

      await user.click(screen.getByRole("button", { name: /Request 1 item/ }));

      expect(requestGearItemsActionMock).not.toHaveBeenCalled();
    });

    // A notice may only link a document that is served (#859): `/terms` 404s
    // on a tenant that has adopted none, and the summary itself is
    // unconditional either way.
    test("links the terms only where the tenant serves them", () => {
      const view = render(
        <GearCartCheckoutForm
          itemIds={["item-1"]}
          options={OPTIONS}
          onSuccess={() => {}}
        />,
      );
      expect(screen.queryByRole("link", { name: /Terms of Use/ })).toBeNull();
      view.unmount();

      render(
        <GearCartCheckoutForm
          itemIds={["item-1"]}
          options={OPTIONS}
          onSuccess={() => {}}
          termsInForce
        />,
      );
      expect(
        screen.getByRole("link", { name: "Terms of Use (opens in new tab)" }),
      ).toHaveAttribute("href", "/terms");
    });

    // #896: the noun is the organization's, in the box and in the words above
    // it, because the snapshot stored against the request is the same string.
    test("is written in this organization's own word for what it lends", () => {
      render(
        <GearCartCheckoutForm
          itemIds={["item-1"]}
          options={OPTIONS}
          onSuccess={() => {}}
          lexicon={{ ...DEFAULT_LEXICON, item_plural: "Tools" }}
        />,
      );

      expect(
        screen.getByRole("checkbox", {
          name: /I understand the tools are given as-is/,
        }),
      ).toBeVisible();
      expect(
        screen.getByText(/We give away tools exactly as they reach us/),
      ).toBeVisible();
    });
  });
});
