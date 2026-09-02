"use client";

import { FormEvent, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  listAvailableInventoryItemsAction,
  recordEventDistributionAction,
} from "./distribution-actions";
import { listPeopleAction, type PersonListItem } from "../people/actions";
import { PersonPicker, type PickedPerson } from "../people/person-picker";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";

function nowLocalValue() {
  const date = new Date();
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

export function RecordDistributionModal({
  triggerLabel = "Record distribution",
  eventId,
  showRecipientField = false,
  onSaved,
}: {
  triggerLabel?: string;
  eventId?: string;
  showRecipientField?: boolean;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [availableItems, setAvailableItems] = useState<
    { id: string; description: string; type: string }[]
  >([]);
  const [people, setPeople] = useState<PersonListItem[]>([]);
  const [recipient, setRecipient] = useState<PickedPerson | null>(null);

  const [inventoryItemId, setInventoryItemId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [reason, setReason] = useState("");
  const [occurredAt, setOccurredAt] = useState(nowLocalValue());
  const [markDistributed, setMarkDistributed] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    listAvailableInventoryItemsAction().then((result) => {
      if (!("error" in result)) setAvailableItems(result.data);
    });
    if (showRecipientField) {
      listPeopleAction().then((result) => {
        if (!("error" in result)) setPeople(result.data);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function reset() {
    setInventoryItemId("");
    setQuantity("1");
    setReason("");
    setOccurredAt(nowLocalValue());
    setMarkDistributed(true);
    setRecipient(null);
    setError(null);
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) reset();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const quantityNumber = Number(quantity);

    startTransition(async () => {
      const result = await recordEventDistributionAction({
        inventoryItemId,
        quantity: quantityNumber,
        reason,
        // Converted here, in the browser, so the recorded instant is fixed
        // using the user's own timezone rather than the server's.
        occurredAt: occurredAt ? new Date(occurredAt).toISOString() : undefined,
        markDistributed,
        eventId,
        recipientPersonId: recipient?.id,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      handleOpenChange(false);
      router.refresh();
      onSaved?.();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="secondary"
            className="shrink-0 whitespace-nowrap"
          />
        }
      >
        {triggerLabel}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Record a distribution</DialogTitle>
          <DialogDescription>
            Record gear being handed out from inventory.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="dist-item">Inventory item</FieldLabel>
              <Select
                value={inventoryItemId || null}
                onValueChange={(value) => setInventoryItemId(value ?? "")}
              >
                <SelectTrigger id="dist-item" className="w-full">
                  <SelectValue placeholder="Select an available item">
                    {(value: string) => {
                      const item = availableItems.find(
                        (candidate) => candidate.id === value,
                      );
                      return item
                        ? `${item.description} (${item.type})`
                        : "Select an available item";
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {availableItems.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.description} ({item.type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field orientation="responsive">
              <Field>
                <FieldLabel htmlFor="dist-quantity">Quantity</FieldLabel>
                <Input
                  id="dist-quantity"
                  type="number"
                  min={1}
                  step={1}
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="dist-occurredAt">
                  Date &amp; time
                </FieldLabel>
                <Input
                  id="dist-occurredAt"
                  type="datetime-local"
                  value={occurredAt}
                  onChange={(event) => setOccurredAt(event.target.value)}
                />
              </Field>
            </Field>

            {showRecipientField && (
              <Field>
                <FieldLabel>Recipient (optional)</FieldLabel>
                <PersonPicker
                  people={people}
                  selected={recipient}
                  onSelect={setRecipient}
                  onPersonCreated={(person) =>
                    setPeople((prev) => [
                      ...prev,
                      { ...person, is_sponsor: false },
                    ])
                  }
                  placeholder="Search recipient by name or email..."
                />
              </Field>
            )}

            <Field>
              <FieldLabel htmlFor="dist-reason">Reason / notes</FieldLabel>
              <Textarea
                id="dist-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </Field>

            <Field orientation="horizontal">
              <Checkbox
                id="dist-markDistributed"
                checked={markDistributed}
                onCheckedChange={(checked) =>
                  setMarkDistributed(Boolean(checked))
                }
              />
              <FieldLabel htmlFor="dist-markDistributed">
                Mark item as distributed
              </FieldLabel>
            </Field>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </FieldGroup>

          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <>
                  <Spinner /> Saving...
                </>
              ) : (
                "Record distribution"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
