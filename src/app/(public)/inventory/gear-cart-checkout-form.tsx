"use client";

import { FormEvent, useState, useTransition } from "react";
import { requestGearItemsAction } from "./gear-cart-request-actions";
import { GearRequesterFields } from "./gear-requester-fields";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";

export function GearCartCheckoutForm({
  itemIds,
  onSuccess,
}: {
  itemIds: string[];
  onSuccess: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [company, setCompany] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("name", name);
    formData.set("email", email);
    formData.set("phone", phone);
    formData.set("notes", notes);
    formData.set("company", company);

    startTransition(async () => {
      const result = await requestGearItemsAction(itemIds, formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      onSuccess();
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <FieldGroup>
        <GearRequesterFields
          idPrefix="cart-checkout"
          name={name}
          onNameChange={setName}
          email={email}
          onEmailChange={setEmail}
          phone={phone}
          onPhoneChange={setPhone}
          notes={notes}
          onNotesChange={setNotes}
        />

        {/* Honeypot: hidden from sighted/keyboard users, but bots that
            autofill every field will fill this and get silently rejected
            server-side. Not type="hidden" -- bots skip those. */}
        <div className="sr-only" aria-hidden="true">
          <label htmlFor="cart-checkout-company">Company</label>
          <input
            id="cart-checkout-company"
            name="company"
            tabIndex={-1}
            autoComplete="off"
            value={company}
            onChange={(event) => setCompany(event.target.value)}
          />
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button
          type="submit"
          disabled={isPending || itemIds.length === 0}
          className="w-full sm:w-fit"
        >
          {isPending
            ? "Requesting..."
            : `Request ${itemIds.length} item${itemIds.length === 1 ? "" : "s"}`}
        </Button>
      </FieldGroup>
    </form>
  );
}
