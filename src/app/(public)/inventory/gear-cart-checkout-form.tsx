"use client";

import { FormEvent, useState, useTransition } from "react";
import Link from "next/link";
import { requestGearItemsAction } from "./gear-cart-request-actions";
import {
  EMPTY_SHIPPING_FIELDS,
  GearDeliveryFields,
  GearRequesterContactFields,
  type ShippingFields,
} from "./gear-requester-fields";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { PrivacyNotice } from "@/components/privacy-notice";
import { RequiredFieldsNote } from "@/components/required-fields-note";
import {
  shippingOffered,
  type DeliveryMethod,
  type PublicGearRequestOptions,
} from "@/lib/gear-requests";
import { DEFAULT_LEXICON, type Lexicon } from "@/lib/lexicon";
import { MY_PATH_PREFIX } from "@/lib/constituent/paths";
import {
  EMPTY_CONTACT_PREFILL,
  type ViewerContactPrefill,
} from "@/lib/constituent/viewer";

export function GearCartCheckoutForm({
  itemIds,
  options,
  onSuccess,
  prefill = EMPTY_CONTACT_PREFILL,
  lexicon = DEFAULT_LEXICON,
}: {
  itemIds: string[];
  options: PublicGearRequestOptions;
  onSuccess: (deliveryMethod: DeliveryMethod, requestId: string) => void;
  /**
   * What a signed-in reader's session already knows about them (#1357), so
   * they do not retype it -- and do not mint a second `people` row with a
   * typo. Everything in it is derivable from the caller's own session, which
   * is the line: nothing here may differ according to whether a typed address
   * matches a directory record (§5.23).
   */
  prefill?: ViewerContactPrefill;
  /**
   * This organization's words (#896), for the privacy notice: it names what
   * was requested, and "gear" is one tenant's word for it.
   */
  lexicon?: Lexicon;
}) {
  const [name, setName] = useState(prefill.name);
  const [email, setEmail] = useState(prefill.email);
  const [phone, setPhone] = useState(prefill.phone);
  const [instagramHandle, setInstagramHandle] = useState(
    prefill.instagramHandle,
  );
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

  // A reader with a record of their own requests as that record (#1359):
  // `request_gear_items_as_me()` takes the person from the session, so the
  // contact fields decide nothing and asking for them would be asking for
  // input the request throws away. They are shown instead, because somebody
  // is entitled to see which name they are about to appear under, and
  // changing either is a link to `/my/details` -- the one place a person is
  // edited.
  const requestingAsSelf = prefill.linked;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData();
    if (!requestingAsSelf) {
      formData.set("name", name);
      formData.set("email", email);
      formData.set("phone", phone);
      formData.set("instagram_handle", instagramHandle);
      formData.set("company", company);
    }
    formData.set("notes", notes);
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
      onSuccess(deliveryMethod, result.requestId);
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <FieldGroup>
        {requestingAsSelf ? (
          <p className="app-muted text-sm leading-relaxed">
            Requesting as {name || "yourself"}
            {email ? ` (${email})` : ""}.{" "}
            <Link href={`${MY_PATH_PREFIX}/details`} className="underline">
              Not you, or out of date?
            </Link>
          </p>
        ) : (
          prefill.signedInAs && (
            // One line, and no more than that (#1257). It says which session
            // is filling the fields in, so a shared browser can correct them;
            // it says nothing about what the organization knows.
            <p className="app-muted text-sm">
              Signed in as {prefill.signedInAs}.
            </p>
          )
        )}

        {/* Only where something on screen actually carries a `*`: the contact
            fields, or a shipping address. A linked reader arranging a meetup
            is asked for nothing at all, and a legend about required fields
            with no required field is noise. */}
        {(!requestingAsSelf ||
          (deliveryMethod === "shipping" && shippingOffered(options))) && (
          <RequiredFieldsNote />
        )}

        {!requestingAsSelf && (
          <GearRequesterContactFields
            idPrefix="cart-checkout"
            name={name}
            onNameChange={setName}
            email={email}
            onEmailChange={setEmail}
            phone={phone}
            onPhoneChange={setPhone}
            instagramHandle={instagramHandle}
            onInstagramHandleChange={setInstagramHandle}
          />
        )}

        <GearDeliveryFields
          idPrefix="cart-checkout"
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
            server-side. Not type="hidden" -- bots skip those. There is none on
            the self-service path: it costs an account and an approved claim,
            so a hidden input would only catch somebody already let in. */}
        {!requestingAsSelf && (
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
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <PrivacyNotice surface="gearRequest" lexicon={lexicon} />

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
