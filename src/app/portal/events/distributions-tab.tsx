"use client";

import { FormEvent, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  listAvailableInventoryItemsAction,
  listEventDistributionsAction,
  recordEventDistributionAction,
  type EventDistributionRow,
} from "./distributions-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

function nowLocalValue() {
  const date = new Date();
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

export function DistributionsTab({ eventId, active }: { eventId: string; active: boolean }) {
  const router = useRouter();
  const [distributions, setDistributions] = useState<EventDistributionRow[] | null>(null);
  const [availableItems, setAvailableItems] = useState<{ id: string; description: string; type: string }[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const [inventoryItemId, setInventoryItemId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [reason, setReason] = useState("");
  const [occurredAt, setOccurredAt] = useState(nowLocalValue());
  const [markDistributed, setMarkDistributed] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function refresh() {
    listEventDistributionsAction(eventId).then((result) => {
      if ("error" in result) {
        setLoadError(result.error);
      } else {
        setLoadError(null);
        setDistributions(result.data);
      }
    });
    listAvailableInventoryItemsAction().then((result) => {
      if (!("error" in result)) setAvailableItems(result.data);
    });
  }

  useEffect(() => {
    if (!active) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, eventId]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const formData = new FormData();
    formData.set("inventoryItemId", inventoryItemId);
    formData.set("quantity", quantity);
    formData.set("reason", reason);
    formData.set("occurredAt", occurredAt);
    formData.set("markDistributed", markDistributed ? "on" : "off");

    startTransition(async () => {
      const result = await recordEventDistributionAction(eventId, formData);
      if ("error" in result) {
        setFormError(result.error);
        return;
      }
      setShowAdd(false);
      setInventoryItemId("");
      setQuantity("1");
      setReason("");
      setOccurredAt(nowLocalValue());
      setMarkDistributed(true);
      router.refresh();
      refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {loadError && (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {distributions === null ? (
        <p className="app-muted text-sm">Loading distributions...</p>
      ) : distributions.length === 0 && !showAdd ? (
        <p className="app-muted text-sm">No gear distributed at this event yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>Qty</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Reason</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {distributions?.map((movement) => (
              <TableRow key={movement.id}>
                <TableCell className="font-medium">
                  {movement.inventory_item?.description ?? "—"}
                  <span className="app-muted block text-xs">{movement.inventory_item?.type}</span>
                </TableCell>
                <TableCell>{movement.quantity}</TableCell>
                <TableCell className="app-muted">{dateFormatter.format(new Date(movement.occurred_at))}</TableCell>
                <TableCell className="app-muted">{movement.reason || "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {showAdd ? (
        <form onSubmit={handleSubmit} className="rounded-md border border-[var(--line)] p-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="dist-item">Inventory item</FieldLabel>
              <Select value={inventoryItemId || null} onValueChange={(value) => setInventoryItemId(value ?? "")}>
                <SelectTrigger id="dist-item" className="w-full">
                  <SelectValue placeholder="Select an available item">
                    {(value: string) => {
                      const item = availableItems.find((candidate) => candidate.id === value);
                      return item ? `${item.description} (${item.type})` : "Select an available item";
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
                <FieldLabel htmlFor="dist-occurredAt">Date &amp; time</FieldLabel>
                <Input
                  id="dist-occurredAt"
                  type="datetime-local"
                  value={occurredAt}
                  onChange={(event) => setOccurredAt(event.target.value)}
                />
              </Field>
            </Field>

            <Field>
              <FieldLabel htmlFor="dist-reason">Reason / notes</FieldLabel>
              <Textarea id="dist-reason" value={reason} onChange={(event) => setReason(event.target.value)} />
            </Field>

            <Field orientation="horizontal">
              <Checkbox
                id="dist-markDistributed"
                checked={markDistributed}
                onCheckedChange={(checked) => setMarkDistributed(Boolean(checked))}
              />
              <FieldLabel htmlFor="dist-markDistributed">Mark item as distributed</FieldLabel>
            </Field>

            {formError && (
              <Alert variant="destructive">
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowAdd(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Saving..." : "Record distribution"}
              </Button>
            </div>
          </FieldGroup>
        </form>
      ) : (
        <Button type="button" variant="outline" onClick={() => setShowAdd(true)}>
          + Record distribution
        </Button>
      )}
    </div>
  );
}
