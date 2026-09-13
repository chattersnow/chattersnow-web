"use client";

import { FormEvent, useState, useTransition } from "react";
import { requestGearItemsAction } from "./gear-cart-request-actions";
import {
  EMPTY_SHIPPING_FIELDS,
  GearRequesterFields,
  type ShippingFields,
} from "./gear-requester-fields";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { RequiredFieldsNote } from "@/components/required-fields-note";
import type {
  DeliveryMethod,
  PublicGearRequestOptions,
} from "@/lib/gear-requests";

export function GearCartCheckoutForm({
  itemIds,
  options,
  onSuccess,
}: {
  itemIds: string[];
  options: PublicGearRequestOptions;
  onSuccess: (deliveryMethod: DeliveryMethod) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [deliveryMethod, setDeliveryMethod] =
    useState<DeliveryMethod>("meetup");
  const [shipping, setShipping] = useState<ShippingFields>(
    EMPTY_SHIPPING_FIELDS,
  );
  const [paymentMethod, setPaymentMethod] = useState("");
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
    formData.set("delivery_method", deliveryMethod);
    if (deliveryMethod === "shipping") {
      formData.set("ship_name", shipping.name);
      formData.set("ship_line1", shipping.line1);
      formData.set("ship_line2", shipping.line2);
      formData.set("ship_city", shipping.city);
      formData.set("ship_region", shipping.region);
      formData.set("ship_postal_code", shipping.postalCode);
      formData.set("ship_country", shipping.country);
      formData.set("payment_method", paymentMethod);
    }

    startTransition(async () => {
      const result = await requestGearItemsAction(itemIds, formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      onSuccess(deliveryMethod);
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <FieldGroup>
        <RequiredFieldsNote />
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
          options={options}
          deliveryMethod={deliveryMethod}
          onDeliveryMethodChange={setDeliveryMethod}
          shipping={shipping}
          onShippingChange={setShipping}
          paymentMethod={paymentMethod}
          onPaymentMethodChange={setPaymentMethod}
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
