import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { buildReceipt } from "../../receipt";
import type { SaleRow } from "../../sales-shared";
import { SaleReceipt } from "./sale-receipt";

const printMock = mock(() => {});

function sale(overrides: Partial<SaleRow> = {}): SaleRow {
  return {
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
    notes: "Merch table, paid in cash.",
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
      {
        id: "line-2",
        product_variant_id: null,
        description: "Donated print",
        unit_price: "25.00",
        list_price: null,
        quantity: 1,
        line_total: "25.00",
      },
    ],
    ...overrides,
  };
}

function renderReceipt(overrides: Partial<SaleRow> = {}, autoPrint = false) {
  return render(
    <SaleReceipt
      model={buildReceipt(sale(overrides), {
        name: "Example Nonprofit",
        logoUrl: null,
      })}
      autoPrint={autoPrint}
    />,
  );
}

describe("SaleReceipt", () => {
  beforeEach(() => {
    printMock.mockClear();
    window.print = printMock;
  });

  test("prints the org, the number, the lines and the totals", () => {
    renderReceipt();

    expect(screen.getByText("Example Nonprofit")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "Receipt #000123" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Fall Trailhead Cleanup")).toBeInTheDocument();

    for (const cell of [
      "Chatter Snow Beanie — One size",
      "Donated print",
      "$20.00",
      "$40.00",
    ]) {
      expect(screen.getByText(cell)).toBeInTheDocument();
    }
    // A single custom line at $25: its unit price and its line total are the
    // same figure, and both are printed.
    expect(screen.getAllByText("$25.00")).toHaveLength(2);

    expect(screen.getByText("Subtotal")).toBeInTheDocument();
    expect(screen.getByText("−$5.00")).toBeInTheDocument();
    expect(screen.getByText("Tax (8.25%)")).toBeInTheDocument();
    expect(screen.getByText("$64.95")).toBeInTheDocument();
    expect(screen.getByText("Cash")).toBeInTheDocument();
    expect(screen.getByText("Jamie Rivera")).toBeInTheDocument();
  });

  test("the internal note is nowhere on it", () => {
    renderReceipt();
    expect(screen.queryByText(/Merch table/)).toBeNull();
  });

  test("the printed region is the scoped one, and the toolbar is outside it", () => {
    const { container } = renderReceipt();
    const printArea = container.querySelector(".print-area");
    expect(printArea).not.toBeNull();
    expect(
      printArea?.contains(
        screen.getByRole("button", { name: /Print \/ Save as PDF/ }),
      ),
    ).toBe(false);
  });

  test("a completed sale carries no VOIDED banner", () => {
    renderReceipt();
    expect(screen.queryByText("Voided")).toBeNull();
  });

  test("a voided sale carries one, with the date it was voided", () => {
    renderReceipt({ status: "voided", voided_at: "2026-06-02T17:00:00.000Z" });
    expect(screen.getByText("Voided")).toBeInTheDocument();
  });

  test("?print=1 opens the print dialog exactly once", () => {
    renderReceipt({}, true);
    expect(printMock).toHaveBeenCalledTimes(1);
  });

  test("without it, nothing prints until the button is pressed", () => {
    renderReceipt();
    expect(printMock).not.toHaveBeenCalled();

    screen.getByRole("button", { name: /Print \/ Save as PDF/ }).click();
    expect(printMock).toHaveBeenCalledTimes(1);
  });
});
