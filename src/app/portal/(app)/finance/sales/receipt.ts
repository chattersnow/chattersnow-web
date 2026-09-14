import { formatCurrency, personDisplayName } from "@/lib/format";
import { DATE_TIME_WITH_ZONE, formatDateTimeInZone } from "@/lib/time";
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
 *
 * The instants are the one thing this module does *not* pre-format (#1076).
 * They carry a zone with them and are rendered through `formatReceiptInstant`
 * wherever they are shown, so the receipt, its plain-text twin and the emailed
 * version cannot disagree about when the sale happened.
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
  /**
   * The zone every instant below is read in: the organization's own
   * (`org.timezone`, #1065), not the viewer's and not the server's.
   *
   * This is the one portal surface that departs from "display in the viewer's
   * zone" (docs/technical-spec.md 6.1), deliberately. A receipt is printed,
   * pasted into an email and filed; it is a record of when a sale happened
   * rather than a live screen, so two people opening it from different states
   * must read the same time off it. It is also the boundary the finance rollup
   * now counts its days on, so a sale near midnight falls in the same period on
   * the receipt as it does in the report.
   */
  timeZone: string;
  /** The stored instant, unformatted -- see `timeZone` above. */
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
  /** Set only on a voided sale: the instant it was voided. */
  voidedAt: string | null;
};

/**
 * One instant as a receipt says it: "Jun 1, 2026, 11:00 AM MDT".
 *
 * The zone is named rather than implied, per docs/technical-spec.md 6.1 -- on
 * a document that outlives the screen it was printed from, an unlabelled
 * "11:00 AM" is a time nobody can check.
 */
export function formatReceiptInstant(iso: string, timeZone: string): string {
  return formatDateTimeInZone(iso, timeZone, DATE_TIME_WITH_ZONE, "en-US");
}

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
export function buildReceipt(
  sale: SaleRow,
  org: ReceiptOrg,
  timeZone: string,
): ReceiptModel {
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
    timeZone,
    soldAt: sale.sold_at,
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
    voidedAt: sale.status === "voided" ? sale.voided_at : null,
  };
}

/**
 * The same receipt as text, for the copy button -- and, later, for the
 * `text` half of the emailed version. Plain columns rather than a table: it is
 * pasted into a message or a note, where anything cleverer wraps badly.
 *
 * The times are formatted here from the model's own instants and zone rather
 * than handed in already formatted: the clipboard text and the rendered
 * receipt then cannot drift apart, because neither holds a string the other
 * cannot derive.
 */
export function receiptAsPlainText(model: ReceiptModel): string {
  const lines: string[] = [model.orgName, `Receipt ${model.receiptNumber}`];

  if (model.voidedAt) {
    lines.push(
      `VOIDED ${formatReceiptInstant(model.voidedAt, model.timeZone)}`,
    );
  }
  lines.push(formatReceiptInstant(model.soldAt, model.timeZone));
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
