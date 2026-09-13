"use client";

import { useState, type FormEvent, type ReactElement } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { MAX_CUSTOM_DESCRIPTION } from "../sale-form";

/**
 * Rings up something the catalog has never heard of (#1015) — a donated one-off
 * on the table, a coffee, a raffle-adjacent thing.
 *
 * Everything a catalog line would have looked up is typed here instead, which
 * is why this is a dialog rather than three inline fields: a description and a
 * price are a small form, and a cashier should not be able to half-add one by
 * tapping away.
 *
 * The validation below repeats what `parseRecordSaleInput` and the RPC enforce.
 * That is not belt and braces for its own sake — it is the difference between a
 * cashier being told "a custom item needs a price" while the dialog is still
 * open and being told it by a red alert after the sale failed to record.
 *
 * Nothing here is persisted, so there is no `useUnsavedChangesGuard`: closing
 * the dialog costs the three fields, and the register page already guards the
 * cart itself.
 */
export function CustomItemDialog({
  onAdd,
  trigger,
}: {
  onAdd: (item: {
    description: string;
    priceInput: string;
    quantity: number;
  }) => void;
  /** The tile that opens this, rendered by the register beside the product tiles. */
  trigger: ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [priceInput, setPriceInput] = useState("");
  const [quantityInput, setQuantityInput] = useState("1");
  const [error, setError] = useState<string | null>(null);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setDescription("");
      setPriceInput("");
      setQuantityInput("1");
      setError(null);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = description.trim();
    if (trimmed === "") {
      setError("Give the item a description — it is what the receipt says.");
      return;
    }
    if (trimmed.length > MAX_CUSTOM_DESCRIPTION) {
      setError(
        `Keep the description to ${MAX_CUSTOM_DESCRIPTION} characters or fewer.`,
      );
      return;
    }

    const price = Number(priceInput);
    if (priceInput.trim() === "" || !Number.isFinite(price) || price < 0) {
      setError("Enter a price of zero or more.");
      return;
    }

    const quantity = Number(quantityInput);
    if (!Number.isInteger(quantity) || quantity < 1) {
      setError("Quantity must be a whole number of one or more.");
      return;
    }

    onAdd({ description: trimmed, priceInput, quantity });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Custom item</DialogTitle>
          <DialogDescription>
            Something that is not in the catalog. It is priced here, and it
            moves no stock.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="custom-item-description">
                Description
              </FieldLabel>
              <Input
                id="custom-item-description"
                value={description}
                maxLength={MAX_CUSTOM_DESCRIPTION}
                placeholder="Donated print"
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="custom-item-price">Price</FieldLabel>
              <Input
                id="custom-item-price"
                // Decimal rather than number: on a phone this is the numeric
                // pad with a separator, which is what the Discount field uses
                // for the same reason.
                inputMode="decimal"
                placeholder="0.00"
                value={priceInput}
                onChange={(event) => setPriceInput(event.target.value)}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="custom-item-quantity">Quantity</FieldLabel>
              <Input
                id="custom-item-quantity"
                type="number"
                min="1"
                step="1"
                value={quantityInput}
                onChange={(event) => setQuantityInput(event.target.value)}
              />
            </Field>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </FieldGroup>

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <Button type="submit">Add to cart</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
