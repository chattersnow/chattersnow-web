import type { ParseResult } from "@/lib/forms";
import { parseInstagramHandle } from "@/lib/instagram-handle";
import {
  isDeliveryMethod,
  type DeliveryMethod,
  type PublicGearRequestOptions,
} from "@/lib/gear-requests";

export type GearRequestShipping = {
  name: string | null;
  line1: string;
  line2: string | null;
  city: string;
  region: string | null;
  postal_code: string;
  country: string | null;
};

export type GearRequestFormData = {
  name: string;
  email: string;
  phone: string | null;
  /** Without the `@`, and shaped as `people.instagram_handle` requires (#1357). */
  instagramHandle: string | null;
  notes: string | null;
  deliveryMethod: DeliveryMethod;
  /** Present exactly when deliveryMethod is `shipping`. */
  shipping: GearRequestShipping | null;
  /** The key of the tenant's payment method; present exactly when shipping. */
  paymentMethod: string | null;
};

/**
 * Field-level checks only. Whether shipping is on offer at all, and whether
 * the payment method is one the tenant actually accepts, are re-checked
 * authoritatively inside request_gear_items() against the tenant's settings;
 * `options` here is what the form was rendered with, so the message can be
 * specific when the two disagree (a stale tab after an administrator turned
 * shipping off).
 */
export function parseGearRequestForm(
  formData: FormData,
  options: PublicGearRequestOptions = {
    shippingEnabled: false,
    paymentMethods: [],
  },
): ParseResult<GearRequestFormData> {
  const field = (key: string) => String(formData.get(key) ?? "").trim();

  const name = field("name");
  const email = field("email");
  const phone = field("phone");
  const instagramHandle = parseInstagramHandle(
    formData.get("instagram_handle"),
  );
  const notes = field("notes");
  const deliveryMethodRaw = field("delivery_method") || "meetup";

  if (!name) return { error: "Name is required." };
  if (!email || !email.includes("@"))
    return { error: "A valid email is required." };
  if ("error" in instagramHandle) return instagramHandle;
  if (!isDeliveryMethod(deliveryMethodRaw))
    return { error: "Choose how you'd like to receive your items." };
  const deliveryMethod: DeliveryMethod = deliveryMethodRaw;

  const base = {
    name,
    email,
    phone: phone || null,
    instagramHandle: instagramHandle.instagramHandle,
    notes: notes || null,
  };

  if (deliveryMethod === "meetup") {
    return {
      data: { ...base, deliveryMethod, shipping: null, paymentMethod: null },
    };
  }

  if (!options.shippingEnabled || options.paymentMethods.length === 0) {
    return {
      error: "Shipping isn't available right now. Choose a meetup instead.",
    };
  }

  const line1 = field("ship_line1");
  const city = field("ship_city");
  const postalCode = field("ship_postal_code");
  if (!line1) return { error: "A street address is required for shipping." };
  if (!city) return { error: "A city is required for shipping." };
  if (!postalCode) return { error: "A postal code is required for shipping." };

  const paymentMethod = field("payment_method");
  if (!options.paymentMethods.some((method) => method.key === paymentMethod)) {
    return { error: "Choose how you'll pay for the postage." };
  }

  return {
    data: {
      ...base,
      deliveryMethod,
      shipping: {
        name: field("ship_name") || null,
        line1,
        line2: field("ship_line2") || null,
        city,
        region: field("ship_region") || null,
        postal_code: postalCode,
        country: field("ship_country") || null,
      },
      paymentMethod,
    },
  };
}
