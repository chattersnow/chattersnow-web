import {
  formatCurrency,
  formatDateTime,
  personDisplayName,
} from "@/lib/format";
import {
  formatTaxRate,
  paymentMethodLabel,
  type PaymentMethod,
  type SaleRow,
} from "./sales-shared";

/**
 * What a buyer leaves with (#1016, §5.22).
 *
 * Pure on purpose, and deliberately free of server-only imports: emailing a
 * receipt is the follow-on to this ticket, and the renderer that produces
 * `{ subject, text, html }` for it has to be able to import this module from a
 * Server Action without dragging a React tree behind it.
 *
 * Nothing here reads the catalog. `sale_line_items` already snapshots the
 * description and the price charged, so a receipt reprinted next year says what
 * it said on the day, whatever has since been renamed or repriced.
 */

export type ReceiptOrg = {
  name: string;
  /** Already resolved to a renderable URL by getTenantBranding(). */
  logoUrl: string | null;
};

export type ReceiptLine = {
  id: string;
  description: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
};

/** One row of the money block, label and figure both already formatted. */
export type ReceiptTotal = { label: string; value: string };

export type ReceiptModel = {
  orgName: string;
  logoUrl: string | null;
  /** "#000123" -- what a buyer reads back over the phone. */
  receiptNumber: string;
  soldAt: string;
  eventName: string | null;
  lines: ReceiptLine[];
  /** Subtotal, then discount and tax only when either happened, then nothing. */
  totals: ReceiptTotal[];
  total: string;
  paymentMethod: string;
  /**
   * The purchaser's name, never their email or phone. A receipt is handed
   * across a table and may be photographed, filed or left behind; it carries no
   * contact detail the buyer did not already know.
   */
  purchaserName: string | null;
  /** Set only on a voided sale: when it was voided. */
  voidedAt: string | null;
};

/**
 * "#000123". Six digits because a number a buyer reads out loud wants a fixed
 * shape -- "double-oh-oh-one-two-three" is one utterance, and a run that grows
 * a digit mid-year makes two receipts look like different kinds of thing. A
 * tenant past a million sales simply gets a seventh digit.
 */
export function formatReceiptNumber(value: number): string {
  return `#${String(Math.trunc(value)).padStart(6, "0")}`;
}

/**
 * Everything the printed receipt shows, and nothing it does not.
 *
 * Left off deliberately: `notes` (internal -- "rung up twice by mistake" is for
 * the ledger, not the buyer), the cashier, and the org's contact email. That
 * last one lives in `site_content` under `org.email_general` behind
 * `site_content:view`, which a finance or coordinator cashier need not hold,
 * and the only ungated read of it is the host-resolved `public_site_content`
 * view -- the wrong resolution for a session page. One footer line is not worth
 * a session-resolved view; the email follow-on can revisit it.
 */
export function buildReceipt(sale: SaleRow, org: ReceiptOrg): ReceiptModel {
  const discount = Number(sale.discount_amount);
  const taxAmount = Number(sale.tax_amount);

  const totals: ReceiptTotal[] = [
    { label: "Subtotal", value: formatCurrency(sale.subtotal) },
  ];
  // Shown only when there was one. A line reading "Discount $0.00" on a paper
  // receipt invites the question of what discount, every time.
  if (discount > 0) {
    totals.push({ label: "Discount", value: `−${formatCurrency(discount)}` });
  }
  if (taxAmount > 0 || Number(sale.tax_rate) > 0) {
    totals.push({
      label: `Tax (${formatTaxRate(sale.tax_rate)})`,
      value: formatCurrency(taxAmount),
    });
  }

  return {
    orgName: org.name,
    logoUrl: org.logoUrl,
    receiptNumber: formatReceiptNumber(sale.receipt_number),
    soldAt: formatDateTime(sale.sold_at),
    eventName: sale.events?.name ?? null,
    lines: (sale.sale_line_items ?? []).map((line) => ({
      id: line.id,
      description: line.description,
      quantity: line.quantity,
      unitPrice: formatCurrency(line.unit_price),
      lineTotal: formatCurrency(line.line_total),
    })),
    totals,
    total: formatCurrency(sale.total),
    paymentMethod: paymentMethodLabel(sale.payment_method as PaymentMethod),
    purchaserName: sale.purchaser
      ? personDisplayName(sale.purchaser, "") || null
      : null,
    voidedAt: sale.status === "voided" ? formatDateTime(sale.voided_at) : null,
  };
}

/**
 * The same receipt as text, for the copy button -- and, later, for the
 * `text` half of the emailed version. Plain columns rather than a table: it is
 * pasted into a message or a note, where anything cleverer wraps badly.
 */
export function receiptAsPlainText(model: ReceiptModel): string {
  const lines: string[] = [model.orgName, `Receipt ${model.receiptNumber}`];

  if (model.voidedAt) lines.push(`VOIDED ${model.voidedAt}`);
  lines.push(model.soldAt);
  if (model.eventName) lines.push(model.eventName);

  lines.push("");
  for (const line of model.lines) {
    lines.push(
      `${line.quantity} × ${line.description} @ ${line.unitPrice} — ${line.lineTotal}`,
    );
  }

  lines.push("");
  for (const total of model.totals) {
    lines.push(`${total.label}: ${total.value}`);
  }
  lines.push(`Total: ${model.total}`);
  lines.push(`Paid by ${model.paymentMethod}`);
  if (model.purchaserName) lines.push(`Purchaser: ${model.purchaserName}`);

  return lines.join("\n");
}
