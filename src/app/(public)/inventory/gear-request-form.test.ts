import { describe, expect, test } from "bun:test";
import {
  parseGearRequestDelivery,
  parseGearRequestForm,
} from "./gear-request-form";

/**
 * The box is ticked unless a case says otherwise (#1367), so every test below
 * still exercises the rule it was written for rather than the gate.
 */
function formData(fields: Record<string, string>) {
  const fd = new FormData();
  fd.set("as_is_acknowledged", "true");
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

describe("parseGearRequestForm", () => {
  test("requires a name", () => {
    expect(
      parseGearRequestForm(formData({ email: "jane@example.com" })),
    ).toEqual({
      error: "Name is required.",
    });
  });

  test("requires a valid email", () => {
    expect(parseGearRequestForm(formData({ name: "Jane" }))).toEqual({
      error: "A valid email is required.",
    });
    expect(
      parseGearRequestForm(formData({ name: "Jane", email: "not-an-email" })),
    ).toEqual({ error: "A valid email is required." });
  });

  test("normalizes empty phone, handle and notes to null", () => {
    const result = parseGearRequestForm(
      formData({ name: "Jane", email: "jane@example.com" }),
    );
    expect(result).toEqual({
      data: {
        name: "Jane",
        email: "jane@example.com",
        phone: null,
        instagramHandle: null,
        notes: null,
        deliveryMethod: "meetup",
        shipping: null,
        paymentMethod: null,
        asIsAcknowledged: true,
      },
    });
  });

  test("parses valid input, defaulting to a meetup", () => {
    const result = parseGearRequestForm(
      formData({
        name: "Jane",
        email: "jane@example.com",
        phone: "555-1234",
        notes: "Need it by Friday",
      }),
    );
    expect(result).toEqual({
      data: {
        name: "Jane",
        email: "jane@example.com",
        phone: "555-1234",
        instagramHandle: null,
        notes: "Need it by Friday",
        deliveryMethod: "meetup",
        shipping: null,
        paymentMethod: null,
        asIsAcknowledged: true,
      },
    });
  });

  // #1357. The handle is the identifier most likely to be the only one that
  // reaches a requester, and `people.instagram_handle` carries a check
  // constraint -- so it is refused here rather than by Postgres, where it
  // would take the whole request down with it.
  test("takes an Instagram handle with or without the @", () => {
    const parse = (instagram_handle: string) =>
      parseGearRequestForm(
        formData({ name: "Jane", email: "jane@example.com", instagram_handle }),
      );
    expect(parse(" @jane.doe ")).toMatchObject({
      data: { instagramHandle: "jane.doe" },
    });
    expect(parse("jane_doe")).toMatchObject({
      data: { instagramHandle: "jane_doe" },
    });
  });

  test("rejects an Instagram handle the column would not take", () => {
    expect(
      parseGearRequestForm(
        formData({
          name: "Jane",
          email: "jane@example.com",
          instagram_handle: "not a handle!",
        }),
      ),
    ).toEqual({
      error:
        "An Instagram handle can only contain letters, numbers, periods and underscores.",
    });
  });

  test("rejects a delivery method it does not know", () => {
    expect(
      parseGearRequestForm(
        formData({
          name: "Jane",
          email: "jane@example.com",
          delivery_method: "carrier-pigeon",
        }),
      ),
    ).toEqual({ error: "Choose how you'd like to receive your items." });
  });

  // #1032: shipping is the tenant's to offer, and the form was rendered with
  // whatever it offered. A shipping submission against options that do not
  // include it is a stale tab.
  const shippingOffered = {
    shippingEnabled: true,
    paymentMethods: [
      { key: "zelle", label: "Zelle" },
      { key: "venmo", label: "Venmo" },
    ],
  };

  const shippingFields = {
    name: "Jane",
    email: "jane@example.com",
    delivery_method: "shipping",
    ship_line1: "12 Ridge Rd",
    ship_city: "Bend",
    ship_region: "OR",
    ship_postal_code: "97701",
    payment_method: "venmo",
  };

  test("refuses shipping when the tenant does not offer it", () => {
    expect(parseGearRequestForm(formData(shippingFields))).toEqual({
      error: "Shipping isn't available right now. Choose a meetup instead.",
    });
    expect(
      parseGearRequestForm(formData(shippingFields), {
        shippingEnabled: true,
        paymentMethods: [],
      }),
    ).toEqual({
      error: "Shipping isn't available right now. Choose a meetup instead.",
    });
  });

  test("requires a street address, city and postal code for shipping", () => {
    const without = (key: string) => {
      const fields: Record<string, string> = { ...shippingFields };
      delete fields[key];
      return parseGearRequestForm(formData(fields), shippingOffered);
    };
    expect(without("ship_line1")).toEqual({
      error: "A street address is required for shipping.",
    });
    expect(without("ship_city")).toEqual({
      error: "A city is required for shipping.",
    });
    expect(without("ship_postal_code")).toEqual({
      error: "A postal code is required for shipping.",
    });
  });

  test("requires one of the tenant's payment methods for shipping", () => {
    expect(
      parseGearRequestForm(
        formData({ ...shippingFields, payment_method: "cash" }),
        shippingOffered,
      ),
    ).toEqual({ error: "Choose how you'll pay for the postage." });
  });

  test("parses a shipping request", () => {
    expect(
      parseGearRequestForm(
        formData({ ...shippingFields, ship_name: " Jane Doe " }),
        shippingOffered,
      ),
    ).toEqual({
      data: {
        name: "Jane",
        email: "jane@example.com",
        phone: null,
        instagramHandle: null,
        notes: null,
        deliveryMethod: "shipping",
        shipping: {
          name: "Jane Doe",
          line1: "12 Ridge Rd",
          line2: null,
          city: "Bend",
          region: "OR",
          postal_code: "97701",
          country: null,
        },
        paymentMethod: "venmo",
        asIsAcknowledged: true,
      },
    });
  });
});

// #1367. The one field on this form that is a gate rather than a detail: a
// request without it does not parse, on either path. `acknowledged_as_is()`
// refuses it again in the database, because a client-side `required` is a
// convenience and never the gate.
describe("the as-is acknowledgement", () => {
  const AS_IS_ERROR =
    "Please tick the box to confirm you understand these items are given as-is.";

  test("refuses a request that did not tick the box", () => {
    const fd = formData({ name: "Jane", email: "jane@example.com" });
    fd.set("as_is_acknowledged", "false");

    expect(parseGearRequestForm(fd)).toEqual({ error: AS_IS_ERROR });
  });

  test("refuses a request that omits the field entirely", () => {
    const fd = formData({ name: "Jane", email: "jane@example.com" });
    fd.delete("as_is_acknowledged");

    expect(parseGearRequestForm(fd)).toEqual({ error: AS_IS_ERROR });
  });

  // Holding an account is not agreement to anything (#686's argument, applied
  // here): the signed-in path is asked for this exactly as a visitor is.
  test("refuses the signed-in path on the same terms", () => {
    const fd = formData({ notes: "A 9.5 works." });
    fd.delete("as_is_acknowledged");

    expect(parseGearRequestDelivery(fd)).toEqual({ error: AS_IS_ERROR });
  });

  // Before the delivery fields, so somebody who left the box unticked hears
  // about that rather than about their postal code.
  test("is refused ahead of the shipping fields", () => {
    const fd = formData({
      name: "Jane",
      email: "jane@example.com",
      delivery_method: "shipping",
    });
    fd.delete("as_is_acknowledged");

    expect(
      parseGearRequestForm(fd, {
        shippingEnabled: true,
        paymentMethods: [{ key: "venmo", label: "Venmo" }],
      }),
    ).toEqual({ error: AS_IS_ERROR });
  });
});

// The half a signed-in reader with a record submits (#1359): the person comes
// from the session, so there is nothing about them in the form to check.
describe("parseGearRequestDelivery", () => {
  test("accepts a request with no contact fields at all", () => {
    expect(
      parseGearRequestDelivery(formData({ notes: "A 9.5 works." })),
    ).toEqual({
      data: {
        notes: "A 9.5 works.",
        deliveryMethod: "meetup",
        shipping: null,
        paymentMethod: null,
        asIsAcknowledged: true,
      },
    });
  });

  test("still holds the shipping rules the whole form does", () => {
    const options = {
      shippingEnabled: true,
      paymentMethods: [{ key: "venmo", label: "Venmo" }],
    };

    expect(
      parseGearRequestDelivery(
        formData({ delivery_method: "shipping", ship_city: "Bend" }),
        options,
      ),
    ).toEqual({ error: "A street address is required for shipping." });

    expect(
      parseGearRequestDelivery(
        formData({
          delivery_method: "shipping",
          ship_line1: "12 Ridge Rd",
          ship_city: "Bend",
          ship_postal_code: "97701",
          payment_method: "cheque",
        }),
        options,
      ),
    ).toEqual({ error: "Choose how you'll pay for the postage." });
  });
});
