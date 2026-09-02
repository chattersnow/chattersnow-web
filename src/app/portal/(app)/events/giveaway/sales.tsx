"use client";

import { FormEvent, useState, useTransition } from "react";
import { upsertEventGiveawayAction, type Giveaway } from "../giveaway-actions";
import { ReadOnlyField } from "@/components/ui/read-only-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatDate, formatMoney, toDateInputValue } from "./format";
import { Spinner } from "@/components/ui/spinner";

export function GiveawaySalesForm({
  eventId,
  giveaway,
  onSaved,
  onCancel,
}: {
  eventId: string;
  giveaway: Giveaway | null;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(giveaway?.name ?? "");
  const [ticketsSold, setTicketsSold] = useState(
    String(giveaway?.tickets_sold ?? 0),
  );
  const [ticketPrice, setTicketPrice] = useState(
    giveaway?.ticket_price === null || giveaway?.ticket_price === undefined
      ? ""
      : String(giveaway.ticket_price),
  );
  const [revenueAmount, setRevenueAmount] = useState(
    String(giveaway?.revenue_amount ?? 0),
  );
  const [drawingDate, setDrawingDate] = useState(
    toDateInputValue(giveaway?.drawing_date ?? null),
  );
  const [notes, setNotes] = useState(giveaway?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("name", name);
    formData.set("ticketsSold", ticketsSold);
    formData.set("ticketPrice", ticketPrice);
    formData.set("revenueAmount", revenueAmount);
    formData.set("drawingDate", drawingDate);
    formData.set("notes", notes);

    startTransition(async () => {
      const result = await upsertEventGiveawayAction(eventId, formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      onSaved();
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-md border border-[var(--line)] p-4"
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="giveaway-name">Giveaway name</FieldLabel>
          <Input
            id="giveaway-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>

        <Field orientation="responsive">
          <Field>
            <FieldLabel htmlFor="giveaway-ticketsSold">Tickets sold</FieldLabel>
            <Input
              id="giveaway-ticketsSold"
              type="number"
              min={0}
              step={1}
              value={ticketsSold}
              onChange={(e) => setTicketsSold(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="giveaway-ticketPrice">
              Ticket price ($)
            </FieldLabel>
            <Input
              id="giveaway-ticketPrice"
              type="number"
              min="0"
              step="0.01"
              value={ticketPrice}
              onChange={(e) => setTicketPrice(e.target.value)}
            />
          </Field>
        </Field>

        <Field orientation="responsive">
          <Field>
            <FieldLabel htmlFor="giveaway-revenue">Revenue ($)</FieldLabel>
            <Input
              id="giveaway-revenue"
              type="number"
              min="0"
              step="0.01"
              value={revenueAmount}
              onChange={(e) => setRevenueAmount(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="giveaway-drawingDate">Drawing date</FieldLabel>
            <Input
              id="giveaway-drawingDate"
              type="date"
              value={drawingDate}
              onChange={(e) => setDrawingDate(e.target.value)}
            />
          </Field>
        </Field>

        <Field>
          <FieldLabel htmlFor="giveaway-notes">Notes</FieldLabel>
          <Textarea
            id="giveaway-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex justify-end gap-2">
          {onCancel && (
            <Button type="button" variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={isPending}>
            {isPending ? (
              <>
                <Spinner /> Saving...
              </>
            ) : giveaway ? (
              "Save giveaway"
            ) : (
              "Set up giveaway"
            )}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

export function GiveawaySummary({ giveaway }: { giveaway: Giveaway }) {
  return (
    <div className="rounded-md border border-[var(--line)] p-4">
      <FieldGroup>
        <ReadOnlyField label="Giveaway name" htmlFor="giveaway-name">
          {giveaway.name || "—"}
        </ReadOnlyField>

        <Field orientation="responsive">
          <ReadOnlyField label="Tickets sold" htmlFor="giveaway-ticketsSold">
            {giveaway.tickets_sold}
          </ReadOnlyField>
          <ReadOnlyField label="Ticket price" htmlFor="giveaway-ticketPrice">
            {formatMoney(giveaway.ticket_price)}
          </ReadOnlyField>
        </Field>

        <Field orientation="responsive">
          <ReadOnlyField label="Revenue" htmlFor="giveaway-revenue">
            {formatMoney(giveaway.revenue_amount)}
          </ReadOnlyField>
          <ReadOnlyField label="Drawing date" htmlFor="giveaway-drawingDate">
            {formatDate(giveaway.drawing_date)}
          </ReadOnlyField>
        </Field>

        <ReadOnlyField label="Notes" htmlFor="giveaway-notes">
          {giveaway.notes || "—"}
        </ReadOnlyField>
      </FieldGroup>
    </div>
  );
}

export function SalesSection({
  eventId,
  giveaway,
  canEdit,
  onSaved,
  onCancel,
}: {
  eventId: string;
  giveaway: Giveaway | null;
  canEdit: boolean;
  onSaved: () => void;
  onCancel: () => void;
}) {
  if (canEdit) {
    return (
      <GiveawaySalesForm
        eventId={eventId}
        giveaway={giveaway}
        onSaved={onSaved}
        onCancel={onCancel}
      />
    );
  }

  if (giveaway) {
    return <GiveawaySummary giveaway={giveaway} />;
  }

  return <p className="app-muted text-sm">No giveaway set up yet.</p>;
}
