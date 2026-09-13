"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { toast } from "@/components/ui/toast";
import { useUnsavedChangesGuard } from "@/components/portal/unsaved-changes-guard";
import { formatCurrency } from "@/lib/format";
import type { PersonHit } from "../../../command-palette-actions";
import { recordSaleAction } from "../actions";
import {
  PAYMENT_METHODS,
  paymentMethodLabel,
  type PaymentMethod,
} from "../sales-shared";
import { CustomItemDialog } from "./custom-item-dialog";
import { PurchaserSearch } from "./purchaser-search";
import {
  addCustomLine,
  addToCart,
  cartLineLabel,
  cartTotals,
  buildRecordSaleInput,
  fromCents,
  lineLabel,
  pickDefaultEvent,
  removeLine,
  setLineQuantity,
  setLineUnitPrice,
  type CartLine,
  type RegisterEvent,
  type RegisterVariant,
} from "./register-cart";

const NO_EVENT = "none";

export function SalesRegister({
  variants,
  events,
  defaultEventId,
  defaultTaxRate = 0,
}: {
  /** Active variants of active products, in catalog order. */
  variants: RegisterVariant[];
  events: RegisterEvent[];
  /** From `?event=` — the event tab's "Open register" deep link. */
  defaultEventId?: string;
  /** The org's rate (percent) from app_settings, prefilled and editable per sale. */
  defaultTaxRate?: number;
}) {
  const router = useRouter();
  const [cart, setCart] = useState<CartLine[]>([]);
  const [eventId, setEventId] = useState<string>(
    () =>
      (defaultEventId && events.some((event) => event.id === defaultEventId)
        ? defaultEventId
        : pickDefaultEvent(events, new Date())) ?? NO_EVENT,
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [purchaser, setPurchaser] = useState<PersonHit | null>(null);
  const [discountInput, setDiscountInput] = useState("");
  // Seeded once from the org default; the cashier may change it for a sale
  // (a tax-exempt buyer, an out-of-state fair) and the RPC snapshots whatever
  // was sent. Kept across sales like the event: the next sale at the same
  // table is at the same rate.
  const [taxRateInput, setTaxRateInput] = useState(() =>
    defaultTaxRate === 0 ? "" : String(defaultTaxRate),
  );
  const [notes, setNotes] = useState("");
  // Which line's price is open for editing, and what has been typed into it.
  // One at a time: the input replaces the price in the row, so two open at once
  // would be two rows the cashier has half-changed.
  const [editingPriceOf, setEditingPriceOf] = useState<string | null>(null);
  const [priceInput, setPriceInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // A cart is unsaved work: no sale exists until Record. Only the page-leave
  // half of the guard applies here -- the register is a page, so there is no
  // dialog close to intercept.
  useUnsavedChangesGuard(cart.length > 0);

  const totals = useMemo(
    () => cartTotals(cart, discountInput, taxRateInput),
    [cart, discountInput, taxRateInput],
  );

  // What is left to sell right now: the catalog figure less what is in the
  // cart, so a tile reads "2 left" after three of five have been added.
  const remaining = useMemo(() => {
    // Custom lines are not in the catalog and count against nothing, so they
    // are left out of the tally entirely.
    const inCart = new Map(
      cart
        .filter((line) => line.variantId !== null)
        .map((line) => [line.variantId as string, line.quantity]),
    );
    return new Map(
      variants.map((variant) => [
        variant.id,
        variant.stockOnHand - (inCart.get(variant.id) ?? 0),
      ]),
    );
  }, [variants, cart]);

  function handleRecord() {
    setError(null);
    startTransition(async () => {
      const result = await recordSaleAction(
        buildRecordSaleInput({
          cart,
          eventId: eventId === NO_EVENT ? null : eventId,
          purchaserPersonId: purchaser?.id ?? null,
          paymentMethod,
          discountInput,
          taxRateInput,
          notes,
        }),
      );

      if ("error" in result) {
        setError(result.error);
        return;
      }

      toast.success(`Sale recorded — ${formatCurrency(result.total)}`);
      // The event and the payment method stay: the next sale at the same table
      // is almost always both. Everything that belongs to one transaction
      // clears.
      setCart([]);
      setPurchaser(null);
      setDiscountInput("");
      setNotes("");
      setEditingPriceOf(null);
      // Refetches the stock the tiles read, which this sale just moved.
      router.refresh();
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
      <section className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Products</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Said above the grid rather than instead of it: an empty catalog
                is a reason to add products, but a custom item can still be rung
                up without one (#1015). */}
            {variants.length === 0 && (
              <p className="app-muted text-sm">
                Nothing is on sale yet. Add a product with a price and some
                stock under Products first.
              </p>
            )}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {variants.map((variant) => {
                const left = remaining.get(variant.id) ?? 0;
                return (
                  <Button
                    key={variant.id}
                    type="button"
                    variant="outline"
                    disabled={left < 1}
                    // Tall enough to hit with a thumb at a merch table, and
                    // the whole tile is the target rather than a link inside
                    // it.
                    className="h-auto min-h-20 flex-col items-start gap-0.5 whitespace-normal p-3 text-left"
                    aria-label={`Add ${lineLabel(variant)}, ${formatCurrency(
                      variant.price,
                    )}`}
                    onClick={() => setCart((prev) => addToCart(prev, variant))}
                  >
                    <span className="font-medium">{variant.productName}</span>
                    <span className="app-muted text-xs">{variant.label}</span>
                    <span className="text-sm font-semibold">
                      {formatCurrency(variant.price)}
                    </span>
                    <span className="app-muted text-xs">
                      {left < 1 ? "Sold out" : `${left} left`}
                    </span>
                  </Button>
                );
              })}

              {/* Last, after the catalog: it is the exception, and a cashier
                  reaches for it only when nothing on the grid fits. */}
              <CustomItemDialog
                onAdd={(item) => setCart((prev) => addCustomLine(prev, item))}
                trigger={
                  <Button
                    type="button"
                    variant="outline"
                    className="h-auto min-h-20 flex-col items-start gap-0.5 whitespace-normal p-3 text-left"
                    aria-label="Add a custom item that is not in the catalog"
                  >
                    <Plus />
                    <span className="font-medium">Custom item</span>
                    <span className="app-muted text-xs">
                      Not in the catalog
                    </span>
                  </Button>
                }
              />
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Cart</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {cart.length === 0 ? (
              <p className="app-muted text-sm">
                Tap a product to start a sale.
              </p>
            ) : (
              <ul className="space-y-3">
                {cart.map((line) => {
                  const label = cartLineLabel(line);
                  const overridden =
                    line.listPriceCents !== null &&
                    line.unitPriceCents !== line.listPriceCents;
                  return (
                    <li key={line.lineId} className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-medium">{label}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Remove ${label}`}
                          onClick={() =>
                            setCart((prev) => removeLine(prev, line.lineId))
                          }
                        >
                          <X />
                        </Button>
                      </div>

                      {/* The unit price is a control, not a caption: changing
                          what one line costs is a thing a cashier does at the
                          table (#1015), and burying it behind an edit mode for
                          the whole cart would make it slower than the
                          sale-wide discount it is meant to replace. */}
                      {editingPriceOf === line.lineId ? (
                        <div className="flex items-center gap-2">
                          <Input
                            autoFocus
                            inputMode="decimal"
                            className="h-9 w-28"
                            aria-label={`Price of ${label}`}
                            value={priceInput}
                            onChange={(event) => {
                              setPriceInput(event.target.value);
                              setCart((prev) =>
                                setLineUnitPrice(
                                  prev,
                                  line.lineId,
                                  event.target.value,
                                ),
                              );
                            }}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingPriceOf(null)}
                          >
                            Done
                          </Button>
                          {line.listPriceCents !== null && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              aria-label={`Reset the price of ${label}`}
                              onClick={() => {
                                setPriceInput("");
                                setCart((prev) =>
                                  setLineUnitPrice(prev, line.lineId, ""),
                                );
                              }}
                            >
                              Reset
                            </Button>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-baseline gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="-ml-2 px-2"
                            aria-label={`Change price of ${label}`}
                            onClick={() => {
                              setPriceInput(
                                String(fromCents(line.unitPriceCents)),
                              );
                              setEditingPriceOf(line.lineId);
                            }}
                          >
                            {formatCurrency(fromCents(line.unitPriceCents))}{" "}
                            each
                          </Button>
                          {overridden && (
                            <span className="app-muted text-xs">
                              was{" "}
                              {formatCurrency(
                                fromCents(line.listPriceCents as number),
                              )}
                            </span>
                          )}
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          // 44px: the smallest target a thumb hits reliably, and
                          // these two get pressed more than anything else here.
                          className="h-11 w-11"
                          aria-label={`One fewer ${label}`}
                          onClick={() =>
                            setCart((prev) =>
                              setLineQuantity(
                                prev,
                                line.lineId,
                                line.quantity - 1,
                              ),
                            )
                          }
                        >
                          <Minus />
                        </Button>
                        <span
                          className="min-w-8 text-center text-sm font-semibold"
                          aria-label={`Quantity of ${label}`}
                        >
                          {line.quantity}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          className="h-11 w-11"
                          aria-label={`One more ${label}`}
                          // A custom line has no stock to run out of.
                          disabled={
                            line.stockOnHand !== null &&
                            line.quantity >= line.stockOnHand
                          }
                          onClick={() =>
                            setCart((prev) =>
                              setLineQuantity(
                                prev,
                                line.lineId,
                                line.quantity + 1,
                              ),
                            )
                          }
                        >
                          <Plus />
                        </Button>
                        <span className="ml-auto text-sm font-medium">
                          {formatCurrency(
                            (line.unitPriceCents * line.quantity) / 100,
                          )}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <Field>
              <FieldLabel htmlFor="register-discount">Discount</FieldLabel>
              <Input
                id="register-discount"
                // A number input on a phone offers a spinner and a full
                // keyboard; decimal offers the numeric pad with a separator.
                inputMode="decimal"
                placeholder="0.00"
                value={discountInput}
                onChange={(event) => setDiscountInput(event.target.value)}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="register-tax-rate">Tax rate (%)</FieldLabel>
              <Input
                id="register-tax-rate"
                type="number"
                inputMode="decimal"
                min="0"
                max="100"
                step="0.001"
                placeholder="0"
                value={taxRateInput}
                onChange={(event) => setTaxRateInput(event.target.value)}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="register-event">Event</FieldLabel>
              <Select
                value={eventId}
                onValueChange={(value) => setEventId(value ?? NO_EVENT)}
              >
                <SelectTrigger id="register-event">
                  <SelectValue placeholder="Event">
                    {(value: string) =>
                      value === NO_EVENT
                        ? "No event"
                        : (events.find((event) => event.id === value)?.name ??
                          "Event")
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_EVENT}>No event</SelectItem>
                  {events.map((event) => (
                    <SelectItem key={event.id} value={event.id}>
                      {event.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel htmlFor="register-payment">Payment</FieldLabel>
              <ToggleGroup
                id="register-payment"
                value={[paymentMethod]}
                onValueChange={(value) => {
                  if (value[0]) setPaymentMethod(value[0] as PaymentMethod);
                }}
                variant="outline"
                className="flex-wrap"
              >
                {PAYMENT_METHODS.map((method) => (
                  <ToggleGroupItem
                    key={method}
                    value={method}
                    aria-label={`Paid by ${paymentMethodLabel(method)}`}
                  >
                    {paymentMethodLabel(method)}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Field>

            <PurchaserSearch selected={purchaser} onSelect={setPurchaser} />

            <Field>
              <FieldLabel htmlFor="register-notes">Notes</FieldLabel>
              <Textarea
                id="register-notes"
                rows={2}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </Field>

            {/* Polite, not assertive: the figure changes on every tap, and a
                screen reader should finish the tile's name before reading the
                new total. */}
            <div
              aria-live="polite"
              className="space-y-1 border-t border-[var(--line)] pt-3 text-sm"
            >
              <div className="flex justify-between">
                <span className="app-muted">Subtotal</span>
                <span>{formatCurrency(totals.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="app-muted">Discount</span>
                <span>{formatCurrency(totals.discount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="app-muted">Tax</span>
                <span>{formatCurrency(totals.tax)}</span>
              </div>
              <div className="flex justify-between text-base font-semibold">
                <span>Total</span>
                <span>{formatCurrency(totals.total)}</span>
              </div>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Sticky on a phone, where the cart is long enough to push the button
            off screen, and in the flow on a desktop beside the tiles. */}
        <div className="sticky bottom-0 -mx-4 border-t border-[var(--line)] bg-[var(--background)] p-4 lg:static lg:mx-0 lg:border-0 lg:p-0">
          <Button
            type="button"
            size="lg"
            className="w-full"
            disabled={cart.length === 0 || isPending}
            onClick={handleRecord}
          >
            {isPending ? (
              <>
                <Spinner /> Recording...
              </>
            ) : (
              `Record sale — ${formatCurrency(totals.total)}`
            )}
          </Button>
        </div>
      </section>
    </div>
  );
}
