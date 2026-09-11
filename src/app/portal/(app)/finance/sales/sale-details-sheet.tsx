"use client";

import { useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Eye, Pencil } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ReadOnlyField } from "@/components/ui/read-only-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import {
  formatCurrency,
  formatDateTime,
  personDisplayName,
} from "@/lib/format";
import { updateSaleAction, voidSaleAction } from "./actions";
import { SaleStatusBadge } from "./sale-badges";
import {
  paymentMethodLabel,
  type EventOption,
  type PaymentMethod,
  type SaleRow,
} from "./sales-shared";

const NO_EVENT = "none";

export function SaleDetailsSheet({
  sale,
  events,
  canManage,
  lockEventSelection = false,
  onSaved,
}: {
  sale: SaleRow;
  events: EventOption[];
  canManage: boolean;
  /** The event's own Sales tab, where moving a sale off the event makes no sense. */
  lockEventSelection?: boolean;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [eventId, setEventId] = useState<string>(sale.event_id ?? NO_EVENT);
  const [notes, setNotes] = useState<string>(sale.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [confirmingVoid, setConfirmingVoid] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [isPending, startTransition] = useTransition();

  const formId = `edit-sale-form-${sale.id}`;
  const lines = sale.sale_line_items ?? [];

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setEventId(sale.event_id ?? NO_EVENT);
      setNotes(sale.notes ?? "");
      setError(null);
      setMode("view");
    }
  }

  function refresh() {
    if (onSaved) onSaved();
    else router.refresh();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("eventId", eventId === NO_EVENT ? "" : eventId);
    // The purchaser is not editable here: changing who bought something is a
    // person lookup, and the register is where a purchaser is chosen. What the
    // sheet offers is the event and the note.
    formData.set("purchaserPersonId", sale.purchaser_person_id ?? "");
    formData.set("notes", notes);

    startTransition(async () => {
      const result = await updateSaleAction(sale.id, formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setMode("view");
      toast.success("Sale saved.");
      refresh();
    });
  }

  function handleVoid() {
    setError(null);
    startTransition(async () => {
      const result = await voidSaleAction(sale.id, voidReason);
      setConfirmingVoid(false);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setVoidReason("");
      setMode("view");
      toast.success("Sale voided.");
      refresh();
    });
  }

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <Tooltip>
          <SheetTrigger
            render={
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`View sale of ${formatCurrency(sale.total)}`}
                  />
                }
              />
            }
          >
            <Eye />
          </SheetTrigger>
          <TooltipContent>View sale</TooltipContent>
        </Tooltip>
        <SheetContent side="right" showCloseButton={false}>
          <SheetHeader className="flex-row items-start gap-2 space-y-0">
            <Tooltip>
              <SheetClose
                render={
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Close"
                      />
                    }
                  />
                }
              >
                <ArrowLeft />
              </SheetClose>
              <TooltipContent>Close</TooltipContent>
            </Tooltip>
            <div className="flex flex-1 flex-col gap-0.5">
              <SheetTitle>
                {mode === "edit" ? "Edit sale" : formatCurrency(sale.total)}
              </SheetTitle>
              <SheetDescription>
                {mode === "edit"
                  ? "Correct which event it belongs to, or what the note says."
                  : `${formatDateTime(sale.sold_at)} — ${paymentMethodLabel(
                      sale.payment_method as PaymentMethod,
                    )}`}
              </SheetDescription>
            </div>
            {canManage &&
              sale.status === "completed" &&
              (mode === "view" ? (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Edit sale"
                        onClick={() => setMode("edit")}
                      />
                    }
                  >
                    <Pencil />
                  </TooltipTrigger>
                  <TooltipContent>Edit sale</TooltipContent>
                </Tooltip>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setMode("view")}
                >
                  View
                </Button>
              ))}
          </SheetHeader>

          {mode === "view" ? (
            <div className="flex-1 space-y-6 overflow-y-auto px-4 pb-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <SaleStatusBadge status={sale.status} />
                {sale.status === "voided" && sale.voided_at && (
                  <span className="app-muted text-xs">
                    Voided {formatDateTime(sale.voided_at)}
                  </span>
                )}
              </div>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Items</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((line) => (
                      <TableRow key={line.id}>
                        <TableCell>{line.description}</TableCell>
                        <TableCell className="text-right">
                          {line.quantity}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(line.unit_price)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(line.line_total)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </section>

              <FieldGroup>
                <ReadOnlyField label="Subtotal" htmlFor="sale-subtotal-view">
                  {formatCurrency(sale.subtotal)}
                </ReadOnlyField>
                <ReadOnlyField label="Discount" htmlFor="sale-discount-view">
                  {formatCurrency(sale.discount_amount)}
                </ReadOnlyField>
                <ReadOnlyField label="Total" htmlFor="sale-total-view">
                  {formatCurrency(sale.total)}
                </ReadOnlyField>
                <ReadOnlyField label="Purchaser" htmlFor="sale-purchaser-view">
                  {sale.purchaser ? (
                    <Link
                      href={`/portal/people/${sale.purchaser.id}`}
                      className="underline hover:text-foreground"
                    >
                      {personDisplayName(sale.purchaser)}
                    </Link>
                  ) : (
                    "—"
                  )}
                </ReadOnlyField>
                <ReadOnlyField label="Event" htmlFor="sale-event-view">
                  {sale.events?.name ?? "—"}
                </ReadOnlyField>
                <ReadOnlyField label="Notes" htmlFor="sale-notes-view">
                  {sale.notes ?? "—"}
                </ReadOnlyField>
                {sale.status === "voided" && (
                  <ReadOnlyField
                    label="Void reason"
                    htmlFor="sale-void-reason-view"
                  >
                    {sale.void_reason ?? "—"}
                  </ReadOnlyField>
                )}
              </FieldGroup>
            </div>
          ) : (
            <form
              id={formId}
              onSubmit={handleSubmit}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="flex-1 overflow-y-auto px-4 pb-4">
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor={`sale-event-${sale.id}`}>
                      Event
                    </FieldLabel>
                    <Select
                      value={eventId}
                      onValueChange={(value) => setEventId(value ?? NO_EVENT)}
                      disabled={lockEventSelection}
                    >
                      <SelectTrigger id={`sale-event-${sale.id}`}>
                        <SelectValue placeholder="Event">
                          {(value: string) =>
                            value === NO_EVENT
                              ? "No event"
                              : (events.find((event) => event.id === value)
                                  ?.name ?? "Event")
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
                    <FieldLabel htmlFor={`sale-notes-${sale.id}`}>
                      Notes
                    </FieldLabel>
                    <Textarea
                      id={`sale-notes-${sale.id}`}
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      rows={3}
                    />
                  </Field>

                  {error && (
                    <Alert variant="destructive">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}
                </FieldGroup>
              </div>
            </form>
          )}

          {mode === "edit" && (
            <SheetFooter className="flex-row justify-between border-t bg-muted/50">
              <Button
                type="button"
                variant="destructive"
                disabled={isPending}
                onClick={() => setConfirmingVoid(true)}
              >
                Void sale
              </Button>
              <Button type="submit" form={formId} disabled={isPending}>
                {isPending ? (
                  <>
                    <Spinner /> Saving...
                  </>
                ) : (
                  "Save changes"
                )}
              </Button>
            </SheetFooter>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmingVoid} onOpenChange={setConfirmingVoid}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Void this sale?</AlertDialogTitle>
            <AlertDialogDescription>
              Its items go back into stock and it stops counting toward income.
              The sale itself is kept, with the reason attached — nothing in the
              ledger is deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Field>
            <FieldLabel htmlFor={`void-reason-${sale.id}`}>
              Reason (optional)
            </FieldLabel>
            <Input
              id={`void-reason-${sale.id}`}
              value={voidReason}
              onChange={(event) => setVoidReason(event.target.value)}
              placeholder="Rung up twice, returned, wrong size..."
            />
          </Field>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmingVoid(false)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleVoid} disabled={isPending}>
              Void sale
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
