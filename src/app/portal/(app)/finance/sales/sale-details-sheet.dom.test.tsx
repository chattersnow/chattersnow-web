import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as SalesActions from "./actions";
import type { SaleRow } from "./sales-shared";

type ActionResult = { error: string } | { success: true };

const voidSaleActionMock = mock<
  (saleId: string, reason: string) => Promise<ActionResult>
>(async () => ({ success: true }));

mock.module("./actions", () => ({
  ...SalesActions,
  voidSaleAction: voidSaleActionMock,
}));

mock.module("next/navigation", () => ({
  useRouter: () => ({ refresh: mock(() => {}) }),
}));

const { SaleDetailsSheet } = await import("./sale-details-sheet");

const SALE: SaleRow = {
  id: "dcdcdcdc-0000-4000-8000-000000000001",
  receipt_number: 123,
  event_id: "cccccccc-0000-4000-8000-000000000002",
  purchaser_person_id: "bbbbbbbb-0000-4000-8000-000000000001",
  sold_at: "2026-06-01T17:00:00.000Z",
  payment_method: "cash",
  subtotal: "65.00",
  discount_amount: "5.00",
  tax_rate: "8.250",
  tax_amount: "4.95",
  total: "64.95",
  status: "completed",
  voided_at: null,
  void_reason: null,
  notes: "Merch table",
  events: { name: "Fall Trailhead Cleanup" },
  purchaser: {
    id: "bbbbbbbb-0000-4000-8000-000000000001",
    name: "Jamie Rivera",
    preferred_name: null,
  },
  sale_line_items: [
    {
      id: "line-1",
      product_variant_id: "cdcdcdcd-0000-4000-8000-000000001001",
      description: "Chatter Snow Beanie — One size",
      unit_price: "20.00",
      list_price: "20.00",
      quantity: 2,
      line_total: "40.00",
    },
  ],
};

const EVENTS = [{ id: SALE.event_id!, name: "Fall Trailhead Cleanup" }];

async function openSheet(canManage = true) {
  const user = userEvent.setup();
  render(
    <SaleDetailsSheet sale={SALE} events={EVENTS} canManage={canManage} />,
  );
  await user.click(screen.getByRole("button", { name: "View sale of $64.95" }));
  return user;
}

describe("SaleDetailsSheet", () => {
  beforeEach(() => {
    voidSaleActionMock.mockClear();
  });

  test("lists what was in the sale, priced as it was sold", async () => {
    await openSheet();

    expect(
      screen.getByText("Chatter Snow Beanie — One size"),
    ).toBeInTheDocument();
    expect(screen.getByText("$40.00")).toBeInTheDocument();
    expect(screen.getByText("Jamie Rivera")).toBeInTheDocument();
  });

  test("voiding takes a confirmation, and only then calls the action", async () => {
    const user = await openSheet();

    await user.click(screen.getByRole("button", { name: "Edit sale" }));
    await user.click(screen.getByRole("button", { name: "Void sale" }));

    // The dialog is open and nothing has been voided yet: stock moving back is
    // not something to do on a stray tap.
    expect(screen.getByText("Void this sale?")).toBeInTheDocument();
    expect(voidSaleActionMock).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Reason (optional)"), "Wrong size");
    const confirm = screen
      .getAllByRole("button", { name: "Void sale" })
      .at(-1)!;
    await user.click(confirm);

    expect(voidSaleActionMock).toHaveBeenCalledWith(SALE.id, "Wrong size");
  });

  test("a reader without manage gets no edit or void affordance", async () => {
    await openSheet(false);

    expect(
      screen.queryByRole("button", { name: "Edit sale" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Void sale" }),
    ).not.toBeInTheDocument();
  });

  test("a voided sale cannot be edited or voided again", async () => {
    const user = userEvent.setup();
    render(
      <SaleDetailsSheet
        sale={{
          ...SALE,
          status: "voided",
          voided_at: "2026-06-02T17:00:00.000Z",
          void_reason: "Rung up twice",
        }}
        events={EVENTS}
        canManage
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "View sale of $64.95" }),
    );

    expect(screen.getByText("Voided")).toBeInTheDocument();
    expect(screen.getByText("Rung up twice")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Edit sale" }),
    ).not.toBeInTheDocument();
  });
});

describe("SaleDetailsSheet receipts (#1016)", () => {
  test("the header is the receipt number and the total", async () => {
    await openSheet();
    expect(screen.getByText("#000123 · $64.95")).toBeInTheDocument();
  });

  test("a completed sale links to its receipt in a new tab", async () => {
    await openSheet();

    const link = screen.getByRole("link", { name: "Receipt #000123" });
    expect(link).toHaveAttribute(
      "href",
      `/portal/finance/sales/${SALE.id}/receipt`,
    );
    expect(link).toHaveAttribute("target", "_blank");
  });

  test("a reader without manage still gets the receipt", async () => {
    await openSheet(false);
    expect(
      screen.getByRole("link", { name: "Receipt #000123" }),
    ).toBeInTheDocument();
  });

  test("a voided sale links to its receipt too -- that is the one with the banner", async () => {
    const user = userEvent.setup();
    render(
      <SaleDetailsSheet
        sale={{
          ...SALE,
          status: "voided",
          voided_at: "2026-06-02T17:00:00.000Z",
        }}
        events={EVENTS}
        canManage
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "View sale of $64.95" }),
    );
    expect(
      screen.getByRole("link", { name: "Receipt #000123" }),
    ).toBeInTheDocument();
  });
});

describe("SaleDetailsSheet line prices and custom items (#1015)", () => {
  test("an overridden line shows what it would have cost, and a custom line says so", async () => {
    const sale = {
      ...SALE,
      sale_line_items: [
        {
          id: "line-1",
          product_variant_id: "cdcdcdcd-0000-4000-8000-000000001001",
          description: "Chatter Snow Beanie — One size",
          unit_price: "5.00",
          list_price: "20.00",
          quantity: 1,
          line_total: "5.00",
        },
        {
          id: "line-2",
          product_variant_id: null,
          description: "Donated print",
          unit_price: "3.50",
          list_price: null,
          quantity: 1,
          line_total: "3.50",
        },
      ],
    };

    const user = userEvent.setup();
    render(<SaleDetailsSheet sale={sale} events={EVENTS} canManage />);
    await user.click(screen.getByRole("button", { name: /View sale/ }));

    // A line through text is not announced, so the label spells it out.
    expect(await screen.findByLabelText("Was $20.00")).toBeInTheDocument();
    expect(screen.getByText("Custom")).toBeInTheDocument();
  });
});
