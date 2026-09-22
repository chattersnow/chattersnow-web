import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  DELIVERY_METHODS,
  shippingOffered,
  type DeliveryMethod,
  type PublicGearRequestOptions,
} from "@/lib/gear-requests";
import { cn } from "@/lib/utils";

export type ShippingFields = {
  name: string;
  line1: string;
  line2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
};

export const EMPTY_SHIPPING_FIELDS: ShippingFields = {
  name: "",
  line1: "",
  line2: "",
  city: "",
  region: "",
  postalCode: "",
  country: "",
};

// Who to reach about the request, asked of a visitor the application knows
// nothing about. A reader with a record of their own is shown theirs instead
// (#1359) -- see `RequestingAs` in gear-cart-checkout-form.tsx -- because the
// request attaches to that record whatever is typed here, and there is no
// column on `gear_requests` for a correction to travel on.
//
// idPrefix keeps input ids unique in case the form is rendered more than once
// on a page.
export function GearRequesterContactFields({
  idPrefix,
  name,
  onNameChange,
  email,
  onEmailChange,
  phone,
  onPhoneChange,
  instagramHandle,
  onInstagramHandleChange,
}: {
  idPrefix: string;
  name: string;
  onNameChange: (value: string) => void;
  email: string;
  onEmailChange: (value: string) => void;
  phone: string;
  onPhoneChange: (value: string) => void;
  instagramHandle: string;
  onInstagramHandleChange: (value: string) => void;
}) {
  return (
    <>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-name`} required>
          Name
        </FieldLabel>
        <Input
          id={`${idPrefix}-name`}
          required
          autoComplete="name"
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
        />
      </Field>
      <Field orientation="responsive">
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-email`} required>
            Email
          </FieldLabel>
          <Input
            id={`${idPrefix}-email`}
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => onEmailChange(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-phone`}>Phone</FieldLabel>
          <Input
            id={`${idPrefix}-phone`}
            type="tel"
            autoComplete="tel"
            value={phone}
            onChange={(event) => onPhoneChange(event.target.value)}
          />
        </Field>
      </Field>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-instagram`}>Instagram</FieldLabel>
        <Input
          id={`${idPrefix}-instagram`}
          // normalize_instagram_handle() strips a leading @, so the
          // placeholder says so rather than asking for a form the code does
          // not care about (#1182).
          placeholder="handle, with or without the @"
          value={instagramHandle}
          onChange={(event) => onInstagramHandleChange(event.target.value)}
        />
        <FieldDescription>
          Optional. Often the quickest way for us to reach you about a handover.
        </FieldDescription>
      </Field>
    </>
  );
}

// How the requester wants the items (#1032) -- a meetup, or shipping at their
// own cost, which reveals the address and the postage payment choice -- and
// anything they want to say about the request. Every caller asks all of it:
// it is about this one request rather than about the person making it.
export function GearDeliveryFields({
  idPrefix,
  notes,
  onNotesChange,
  options,
  deliveryMethod,
  onDeliveryMethodChange,
  shipping,
  onShippingChange,
  paymentMethod,
  onPaymentMethodChange,
}: {
  idPrefix: string;
  notes: string;
  onNotesChange: (value: string) => void;
  options: PublicGearRequestOptions;
  deliveryMethod: DeliveryMethod;
  onDeliveryMethodChange: (value: DeliveryMethod) => void;
  shipping: ShippingFields;
  onShippingChange: (value: ShippingFields) => void;
  paymentMethod: string;
  onPaymentMethodChange: (value: string) => void;
}) {
  const offersShipping = shippingOffered(options);
  const methods = DELIVERY_METHODS.filter(
    (method) => method.value !== "shipping" || offersShipping,
  );
  const shippingChosen = offersShipping && deliveryMethod === "shipping";

  const setShipping = (patch: Partial<ShippingFields>) =>
    onShippingChange({ ...shipping, ...patch });

  return (
    <>
      {/* One option is still a choice worth showing: it tells the requester
          what to expect (a meetup), and it is where shipping appears the day
          the organization turns it on. */}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">
          How would you like to receive your items?
        </legend>
        {methods.map((method) => {
          const inputId = `${idPrefix}-delivery-${method.value}`;
          const checked = deliveryMethod === method.value;
          return (
            <label
              key={method.value}
              htmlFor={inputId}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition-colors",
                checked
                  ? "border-primary bg-primary/5"
                  : "border-[var(--line)] hover:bg-muted/40",
              )}
            >
              <input
                id={inputId}
                type="radio"
                name={`${idPrefix}-delivery-method`}
                value={method.value}
                className="mt-1"
                checked={checked}
                onChange={() => onDeliveryMethodChange(method.value)}
              />
              <span className="min-w-0">
                <span className="block font-medium">{method.label}</span>
                <span className="app-muted block text-xs leading-relaxed">
                  {method.description}
                </span>
              </span>
            </label>
          );
        })}
      </fieldset>

      {shippingChosen && (
        <FieldGroup className="rounded-lg border border-[var(--line)] p-3">
          <Field>
            <FieldLabel htmlFor={`${idPrefix}-ship-name`}>
              Ship to (if different from your name)
            </FieldLabel>
            <Input
              id={`${idPrefix}-ship-name`}
              autoComplete="shipping name"
              value={shipping.name}
              onChange={(event) => setShipping({ name: event.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${idPrefix}-ship-line1`} required>
              Street address
            </FieldLabel>
            <Input
              id={`${idPrefix}-ship-line1`}
              required
              autoComplete="shipping address-line1"
              value={shipping.line1}
              onChange={(event) => setShipping({ line1: event.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${idPrefix}-ship-line2`}>
              Apartment, unit, etc.
            </FieldLabel>
            <Input
              id={`${idPrefix}-ship-line2`}
              autoComplete="shipping address-line2"
              value={shipping.line2}
              onChange={(event) => setShipping({ line2: event.target.value })}
            />
          </Field>
          <Field orientation="responsive">
            <Field>
              <FieldLabel htmlFor={`${idPrefix}-ship-city`} required>
                City
              </FieldLabel>
              <Input
                id={`${idPrefix}-ship-city`}
                required
                autoComplete="shipping address-level2"
                value={shipping.city}
                onChange={(event) => setShipping({ city: event.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${idPrefix}-ship-region`}>
                State / region
              </FieldLabel>
              <Input
                id={`${idPrefix}-ship-region`}
                autoComplete="shipping address-level1"
                value={shipping.region}
                onChange={(event) =>
                  setShipping({ region: event.target.value })
                }
              />
            </Field>
          </Field>
          <Field orientation="responsive">
            <Field>
              <FieldLabel htmlFor={`${idPrefix}-ship-postal-code`} required>
                Postal code
              </FieldLabel>
              <Input
                id={`${idPrefix}-ship-postal-code`}
                required
                autoComplete="shipping postal-code"
                value={shipping.postalCode}
                onChange={(event) =>
                  setShipping({ postalCode: event.target.value })
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${idPrefix}-ship-country`}>
                Country
              </FieldLabel>
              <Input
                id={`${idPrefix}-ship-country`}
                autoComplete="shipping country-name"
                value={shipping.country}
                onChange={(event) =>
                  setShipping({ country: event.target.value })
                }
              />
            </Field>
          </Field>
          <Field>
            <FieldLabel htmlFor={`${idPrefix}-payment-method`} required>
              How will you pay for the postage?
            </FieldLabel>
            <Select
              value={paymentMethod || null}
              onValueChange={(value) => onPaymentMethodChange(value ?? "")}
            >
              <SelectTrigger
                id={`${idPrefix}-payment-method`}
                aria-required="true"
              >
                <SelectValue placeholder="Choose a payment method" />
              </SelectTrigger>
              <SelectContent>
                {options.paymentMethods.map((method) => (
                  <SelectItem key={method.key} value={method.key}>
                    {method.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>
              We&rsquo;ll send you the amount and where to send it once the
              package is weighed.
            </FieldDescription>
          </Field>
        </FieldGroup>
      )}

      <Field>
        <FieldLabel htmlFor={`${idPrefix}-notes`}>Notes</FieldLabel>
        <Textarea
          id={`${idPrefix}-notes`}
          value={notes}
          onChange={(event) => onNotesChange(event.target.value)}
        />
      </Field>
    </>
  );
}
