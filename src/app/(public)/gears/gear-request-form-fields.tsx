"use client";

import { FormEvent, useState, useTransition } from "react";
import { requestGearItemAction } from "./gear-request-actions";
import { GearRequesterFields } from "./gear-requester-fields";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";

export function GearRequestForm({ itemId }: { itemId: string }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("name", name);
    formData.set("email", email);
    formData.set("phone", phone);
    formData.set("notes", notes);

    startTransition(async () => {
      const result = await requestGearItemAction(itemId, formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setSuccess(true);
    });
  }

  if (success) {
    return (
      <Alert>
        <AlertDescription>
          Request received! This item is now on hold for you and no longer
          available to others. We&apos;ll be in touch to arrange pickup.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <FieldGroup>
        <GearRequesterFields
          idPrefix="request"
          name={name}
          onNameChange={setName}
          email={email}
          onEmailChange={setEmail}
          phone={phone}
          onPhoneChange={setPhone}
          notes={notes}
          onNotesChange={setNotes}
        />

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button type="submit" disabled={isPending} className="w-full sm:w-fit">
          {isPending ? "Requesting..." : "Request this item"}
        </Button>
      </FieldGroup>
    </form>
  );
}
