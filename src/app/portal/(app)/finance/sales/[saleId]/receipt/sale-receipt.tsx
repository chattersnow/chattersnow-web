"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/brand-logo";
import { CopyButton } from "@/components/copy-button";
import { receiptAsPlainText, type ReceiptModel } from "../../receipt";

/**
 * The printable receipt, and the three things you can do with it.
 *
 * "Save as PDF" is the browser's own print dialog rather than a PDF library:
 * every browser a cashier has can already produce one, the governance agenda
 * export has done it this way since it shipped, and a dependency that renders
 * a page the browser already renders is a second layout to keep in step with
 * the first. The scoping is the shared `.print-area` rule in globals.css --
 * everything outside the marked element is hidden for the print, so the
 * toolbar, the sidebar and the breadcrumbs stay off the paper.
 */
export function SaleReceipt({
  model,
  autoPrint = false,
}: {
  model: ReceiptModel;
  autoPrint?: boolean;
}) {
  const printed = useRef(false);

  useEffect(() => {
    if (!autoPrint || printed.current) return;
    // Once per mount, guarded: React runs effects twice in development, and
    // two print dialogs for one sale is one too many.
    printed.current = true;
    window.print();
  }, [autoPrint]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link href="/portal/finance/sales" />}
        >
          <ArrowLeft /> Back to ledger
        </Button>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <CopyButton
            label="Copy as plain text"
            getText={() => receiptAsPlainText(model)}
          />
          <Button type="button" onClick={() => window.print()}>
            <Printer /> Print / Save as PDF
          </Button>
        </div>
      </div>

      {/* Narrow on screen so what the cashier checks on a phone is the shape
          the paper will be, and a plain column on paper, where @page supplies
          the margin. */}
      <div className="print-area mx-auto w-full max-w-sm text-sm print:max-w-none">
        <header className="flex flex-col items-center gap-2 text-center">
          <BrandLogo
            logoUrl={model.logoUrl}
            alt=""
            className="h-12 w-12"
            priority
          />
          {model.orgName && (
            <p className="text-base font-semibold">{model.orgName}</p>
          )}
          <h1 className="brand-display text-2xl font-semibold tracking-[-0.03em]">
            Receipt {model.receiptNumber}
          </h1>
          <p className="app-muted">{model.soldAt}</p>
          {model.eventName && <p className="app-muted">{model.eventName}</p>}
        </header>

        {/* A border and a word, not a colour: a receipt is printed in black
            and white more often than not, and a voided one that reads as
            ordinary is worse than no receipt at all. */}
        {model.voidedAt && (
          <p className="mt-4 border-2 border-current p-3 text-center font-semibold tracking-[0.2em] uppercase">
            Voided
            <span className="block text-xs font-normal tracking-normal normal-case">
              {model.voidedAt}
            </span>
          </p>
        )}

        <table className="mt-4 w-full border-collapse">
          <thead>
            <tr className="border-b border-current/30 text-left">
              <th scope="col" className="py-1 font-medium">
                Item
              </th>
              {/* pl-3 on every figure column: at 400px the description takes
                  what it needs and the three numbers were running together. */}
              <th scope="col" className="py-1 pl-3 text-right font-medium">
                Qty
              </th>
              <th scope="col" className="py-1 pl-3 text-right font-medium">
                Price
              </th>
              <th scope="col" className="py-1 pl-3 text-right font-medium">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {model.lines.map((line) => (
              <tr key={line.id} className="align-top">
                <td className="py-1">{line.description}</td>
                <td className="py-1 pl-3 text-right tabular-nums">
                  {line.quantity}
                </td>
                <td className="py-1 pl-3 text-right tabular-nums">
                  {line.unitPrice}
                </td>
                <td className="py-1 pl-3 text-right tabular-nums">
                  {line.lineTotal}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="mt-4 space-y-1 border-t border-current/30 pt-3">
          {model.totals.map((total) => (
            <div key={total.label} className="flex justify-between gap-4">
              <dt className="app-muted">{total.label}</dt>
              <dd className="tabular-nums">{total.value}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-4 text-base font-semibold">
            <dt>Total</dt>
            <dd className="tabular-nums">{model.total}</dd>
          </div>
        </dl>

        <dl className="mt-4 space-y-1 border-t border-current/30 pt-3">
          <div className="flex justify-between gap-4">
            <dt className="app-muted">Paid by</dt>
            <dd>{model.paymentMethod}</dd>
          </div>
          {/* The name, and nothing else about them: a receipt is handed across
              a table and may be photographed or left behind. */}
          {model.purchaserName && (
            <div className="flex justify-between gap-4">
              <dt className="app-muted">Purchaser</dt>
              <dd>{model.purchaserName}</dd>
            </div>
          )}
        </dl>
      </div>
    </div>
  );
}
