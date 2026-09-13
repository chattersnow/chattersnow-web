import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as SalesActions from "../actions";
import * as PaletteActions from "../../../command-palette-actions";
import type { RegisterEvent, RegisterVariant } from "./register-cart";

type RecordResult =
  { error: string } | { success: true; saleId: string; total: number };

const recordSaleActionMock = mock<(input: unknown) => Promise<RecordResult>>(
  async () => ({ success: true, saleId: "sale-1", total: 20 }),
);

mock.module("../actions", () => ({
  ...SalesActions,
  recordSaleAction: recordSaleActionMock,
}));

mock.module("../../../command-palette-actions", () => ({
  ...PaletteActions,
  searchPeopleAction: mock(async () => ({ people: [] })),
}));

const routerRefresh = mock(() => {});
mock.module("next/navigation", () => ({
  useRouter: () => ({ refresh: routerRefresh }),
}));

const { SalesRegister } = await import("./sales-register");

const BEANIE = "11111111-1111-4111-8111-111111111111";
const TEE = "22222222-2222-4222-8222-222222222222";
const SOLD_OUT = "33333333-3333-4333-8333-333333333333";

const VARIANTS: RegisterVariant[] = [
  {
    id: BEANIE,
    productId: "aaaaaaaa-0000-4000-8000-000000000001",
    productName: "Chatter Snow Beanie",
    label: "One size",
    price: "20.00",
    stockOnHand: 2,
  },
  {
    id: TEE,
    productId: "aaaaaaaa-0000-4000-8000-000000000002",
    productName: "Trailhead Tee",
    label: "M",
    price: "25.00",
    stockOnHand: 5,
  },
  {
    id: SOLD_OUT,
    productId: "aaaaaaaa-0000-4000-8000-000000000003",
    productName: "Sticker Pack",
    label: "Pack of 5",
    price: "5.00",
    stockOnHand: 0,
  },
];

const EVENTS: RegisterEvent[] = [
  {
    id: "eeeeeeee-0000-4000-8000-000000000001",
    name: "Winter Gear Swap",
    startsAt: new Date(Date.now() + 86_400_000).toISOString(),
    endsAt: null,
  },
];

function renderRegister(defaultTaxRate?: number) {
  return render(
    <SalesRegister
      variants={VARIANTS}
      events={EVENTS}
      defaultTaxRate={defaultTaxRate}
    />,
  );
}

const beanieTile = () =>
  screen.getByRole("button", {
    name: "Add Chatter Snow Beanie — One size, $20.00",
  });

describe("SalesRegister", () => {
  beforeEach(() => {
    recordSaleActionMock.mockClear();
    routerRefresh.mockClear();
  });

  test("a tile adds a cart line and the totals follow", async () => {
    const user = userEvent.setup();
    renderRegister();

    await user.click(beanieTile());

    expect(
      screen.getByLabelText("Quantity of Chatter Snow Beanie — One size"),
    ).toHaveTextContent("1");
    expect(
      screen.getByRole("button", { name: "Record sale — $20.00" }),
    ).toBeEnabled();
  });

  test("the stepper stops at the stock the tile reported", async () => {
    const user = userEvent.setup();
    renderRegister();

    await user.click(beanieTile());
    const more = screen.getByRole("button", {
      name: "One more Chatter Snow Beanie — One size",
    });
    await user.click(more);

    const quantity = screen.getByLabelText(
      "Quantity of Chatter Snow Beanie — One size",
    );
    expect(quantity).toHaveTextContent("2");
    // Two of two: there is nothing left to add, so neither the stepper nor the
    // tile may offer a third.
    expect(more).toBeDisabled();
    expect(beanieTile()).toBeDisabled();
    // The tile's own count, not the sticker pack's: it reads what is left
    // after the cart, so two of two leaves none.
    expect(beanieTile()).toHaveTextContent("Sold out");
  });

  test("the org rate is prefilled, taxes the cart, and rides on the payload", async () => {
    const user = userEvent.setup();
    renderRegister(8.25);

    expect(screen.getByLabelText("Tax rate (%)")).toHaveValue(8.25);

    await user.click(beanieTile());
    // $20 at 8.25% is $1.65, on top.
    expect(
      screen.getByRole("button", { name: "Record sale — $21.65" }),
    ).toBeEnabled();

    // Editable per sale: a tax-exempt buyer clears it and the total follows.
    await user.clear(screen.getByLabelText("Tax rate (%)"));
    expect(
      screen.getByRole("button", { name: "Record sale — $20.00" }),
    ).toBeEnabled();

    await user.type(screen.getByLabelText("Tax rate (%)"), "10");
    await user.click(
      screen.getByRole("button", { name: "Record sale — $22.00" }),
    );
    expect(recordSaleActionMock.mock.calls[0][0]).toMatchObject({
      tax_rate: 10,
    });
    // The rate is kept for the next sale at the same table, like the event.
    expect(
      await screen.findByText("Tap a product to start a sale."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Tax rate (%)")).toHaveValue(10);
  });

  test("a sold-out variant cannot be added", () => {
    renderRegister();
    expect(
      screen.getByRole("button", {
        name: "Add Sticker Pack — Pack of 5, $5.00",
      }),
    ).toBeDisabled();
  });

  test("an empty cart cannot be recorded", () => {
    renderRegister();
    expect(
      screen.getByRole("button", { name: "Record sale — $0.00" }),
    ).toBeDisabled();
  });

  test("records ids, quantities and the discount, then clears the cart", async () => {
    const user = userEvent.setup();
    renderRegister();

    await user.click(beanieTile());
    await user.click(
      screen.getByRole("button", { name: "Add Trailhead Tee — M, $25.00" }),
    );
    await user.type(screen.getByLabelText("Discount"), "5");
    await user.type(screen.getByLabelText("Notes"), "merch table");

    await user.click(
      screen.getByRole("button", { name: "Record sale — $40.00" }),
    );

    expect(recordSaleActionMock).toHaveBeenCalledTimes(1);
    expect(recordSaleActionMock.mock.calls[0][0]).toEqual({
      event_id: EVENTS[0].id,
      purchaser_person_id: null,
      payment_method: "cash",
      discount_amount: 5,
      tax_rate: 0,
      notes: "merch table",
      lines: [
        { variant_id: BEANIE, quantity: 1 },
        { variant_id: TEE, quantity: 1 },
      ],
    });

    // The cart and everything belonging to one transaction clear; the event
    // and the payment method are kept for the next sale at the same table.
    //
    // findBy, not getBy: `handleRecord` awaits the action *inside*
    // `startTransition`, so the state it sets lands after the act() that
    // `user.click` resolves on. A synchronous query here is a race that
    // happens to win locally and lost once under CI's coverage
    // instrumentation.
    expect(
      await screen.findByText("Tap a product to start a sale."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Discount")).toHaveValue("");
    expect(routerRefresh).toHaveBeenCalled();
  });

  test("a refused sale shows the reason and keeps the cart", async () => {
    recordSaleActionMock.mockImplementationOnce(async () => ({
      error: "Not enough stock — Chatter Snow Beanie — One size: 1 on hand.",
    }));
    const user = userEvent.setup();
    renderRegister();

    await user.click(beanieTile());
    await user.click(
      screen.getByRole("button", { name: "Record sale — $20.00" }),
    );

    // findBy for the same reason as above: the error is set after an await
    // inside the transition.
    expect(
      await screen.findByText(
        "Not enough stock — Chatter Snow Beanie — One size: 1 on hand.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Quantity of Chatter Snow Beanie — One size"),
    ).toHaveTextContent("1");
  });
});

describe("SalesRegister line prices and custom items (#1015)", () => {
  beforeEach(() => {
    recordSaleActionMock.mockClear();
    routerRefresh.mockClear();
  });

  test("changing a line's price moves the line total and the sale total", async () => {
    const user = userEvent.setup();
    renderRegister();

    await user.click(beanieTile());
    await user.click(
      screen.getByRole("button", {
        name: "Change price of Chatter Snow Beanie — One size",
      }),
    );

    const priceField = screen.getByLabelText(
      "Price of Chatter Snow Beanie — One size",
    );
    await user.clear(priceField);
    await user.type(priceField, "5");

    expect(
      screen.getByRole("button", { name: "Record sale — $5.00" }),
    ).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Done" }));
    // What it would have been, so the cashier can see what they gave away.
    expect(screen.getByText("was $20.00")).toBeInTheDocument();
  });

  test("Reset puts the catalog price back", async () => {
    const user = userEvent.setup();
    renderRegister();

    await user.click(beanieTile());
    await user.click(
      screen.getByRole("button", {
        name: "Change price of Chatter Snow Beanie — One size",
      }),
    );
    const priceField = screen.getByLabelText(
      "Price of Chatter Snow Beanie — One size",
    );
    await user.clear(priceField);
    await user.type(priceField, "5");
    await user.click(
      screen.getByRole("button", {
        name: "Reset Chatter Snow Beanie — One size to its catalog price",
      }),
    );

    expect(
      screen.getByRole("button", { name: "Record sale — $20.00" }),
    ).toBeEnabled();
  });

  test("the Custom item dialog adds a line the catalog has never heard of", async () => {
    const user = userEvent.setup();
    renderRegister();

    await user.click(
      screen.getByRole("button", {
        name: "Add a custom item that is not in the catalog",
      }),
    );
    await user.type(screen.getByLabelText("Description"), "Donated print");
    await user.type(screen.getByLabelText("Price"), "3.50");
    await user.click(screen.getByRole("button", { name: "Add to cart" }));

    expect(
      screen.getByLabelText("Quantity of Donated print"),
    ).toHaveTextContent("1");
    expect(
      screen.getByRole("button", { name: "Record sale — $3.50" }),
    ).toBeEnabled();
  });

  test("a custom item with no price is refused before the sale is built", async () => {
    const user = userEvent.setup();
    renderRegister();

    await user.click(
      screen.getByRole("button", {
        name: "Add a custom item that is not in the catalog",
      }),
    );
    await user.type(screen.getByLabelText("Description"), "Donated print");
    await user.click(screen.getByRole("button", { name: "Add to cart" }));

    expect(
      screen.getByText("Enter a price of zero or more."),
    ).toBeInTheDocument();
  });

  test("the payload carries a price for exactly the overridden and custom lines", async () => {
    const user = userEvent.setup();
    renderRegister();

    await user.click(beanieTile());
    await user.click(
      screen.getByRole("button", { name: "Add Trailhead Tee — M, $25.00" }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "Change price of Chatter Snow Beanie — One size",
      }),
    );
    const priceField = screen.getByLabelText(
      "Price of Chatter Snow Beanie — One size",
    );
    await user.clear(priceField);
    await user.type(priceField, "5");
    await user.click(screen.getByRole("button", { name: "Done" }));

    await user.click(
      screen.getByRole("button", {
        name: "Add a custom item that is not in the catalog",
      }),
    );
    await user.type(screen.getByLabelText("Description"), "Donated print");
    await user.type(screen.getByLabelText("Price"), "3.50");
    await user.click(screen.getByRole("button", { name: "Add to cart" }));

    await user.click(
      screen.getByRole("button", { name: "Record sale — $33.50" }),
    );

    // toEqual, not toMatchObject: the point of the middle line is the key that
    // is *absent* from it, which a partial match would not notice.
    const { lines } = recordSaleActionMock.mock.calls[0][0] as {
      lines: unknown[];
    };
    expect(lines).toEqual([
      { variant_id: BEANIE, quantity: 1, unit_price: 5 },
      // The untouched line is exactly what it was before overrides existed.
      { variant_id: TEE, quantity: 1 },
      { description: "Donated print", unit_price: 3.5, quantity: 1 },
    ]);
  });
});
