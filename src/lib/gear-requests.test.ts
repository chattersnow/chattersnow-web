import { describe, expect, test } from "bun:test";
import {
  parseGearRequestSettings,
  parsePaymentMethods,
  paymentMethodKeyFor,
  resolvePublicGearRequestOptions,
  shippingAddressLines,
} from "./gear-requests";

describe("parsePaymentMethods", () => {
  test("keeps well-formed entries in order and trims their text", () => {
    expect(
      parsePaymentMethods([
        {
          key: "zelle",
          label: " Zelle ",
          handle: " 555-0100 ",
          instructions: "",
        },
        {
          key: "venmo",
          label: "Venmo",
          handle: "@chatter",
          instructions: " Add a note. ",
        },
      ]),
    ).toEqual([
      { key: "zelle", label: "Zelle", handle: "555-0100", instructions: "" },
      {
        key: "venmo",
        label: "Venmo",
        handle: "@chatter",
        instructions: "Add a note.",
      },
    ]);
  });

  test("drops entries with a bad key, no label, or a repeated key", () => {
    expect(
      parsePaymentMethods([
        { key: "Zelle", label: "Zelle" },
        { key: "venmo", label: "  " },
        { key: "cash", label: "Cash" },
        { key: "cash", label: "Cash again" },
        "not an object",
        null,
      ]),
    ).toEqual([{ key: "cash", label: "Cash", handle: "", instructions: "" }]);
  });

  test("answers nothing for anything that is not an array", () => {
    expect(parsePaymentMethods(null)).toEqual([]);
    expect(parsePaymentMethods({ key: "zelle", label: "Zelle" })).toEqual([]);
    expect(parsePaymentMethods("zelle")).toEqual([]);
  });
});

describe("paymentMethodKeyFor", () => {
  test("slugs a label", () => {
    expect(paymentMethodKeyFor("Zelle")).toBe("zelle");
    expect(paymentMethodKeyFor("  Cash App  ")).toBe("cash-app");
    expect(paymentMethodKeyFor("PayPal (friends & family)")).toBe(
      "paypal-friends-family",
    );
  });
});

describe("parseGearRequestSettings", () => {
  test("reads the RPC's shape", () => {
    expect(
      parseGearRequestSettings({
        shipping_enabled: true,
        payment_methods: [{ key: "zelle", label: "Zelle" }],
        meetup_instructions: "Saturdays at the trailhead.",
        shipping_instructions: "Allow a week.",
      }),
    ).toEqual({
      shippingEnabled: true,
      paymentMethods: [
        { key: "zelle", label: "Zelle", handle: "", instructions: "" },
      ],
      meetupInstructions: "Saturdays at the trailhead.",
      shippingInstructions: "Allow a week.",
    });
  });

  test("falls back to the defaults for null and for the wrong types", () => {
    const defaults = {
      shippingEnabled: false,
      paymentMethods: [],
      meetupInstructions: "",
      shippingInstructions: "",
    };
    expect(parseGearRequestSettings(null)).toEqual(defaults);
    expect(
      parseGearRequestSettings({
        shipping_enabled: "yes",
        payment_methods: "zelle",
        meetup_instructions: 3,
      }),
    ).toEqual(defaults);
  });
});

describe("resolvePublicGearRequestOptions", () => {
  test("projects the view's rows down to what the form needs", () => {
    expect(
      resolvePublicGearRequestOptions([
        { slot: "shipping_enabled", value: true },
        {
          slot: "payment_methods",
          value: [
            { key: "zelle", label: "Zelle", handle: "should not survive" },
          ],
        },
      ]),
    ).toEqual({
      shippingEnabled: true,
      paymentMethods: [{ key: "zelle", label: "Zelle" }],
    });
  });

  test("offers meetup only when the view answers nothing", () => {
    expect(resolvePublicGearRequestOptions([])).toEqual({
      shippingEnabled: false,
      paymentMethods: [],
    });
  });
});

describe("shippingAddressLines", () => {
  test("lays the address out as postal lines, blanks dropped", () => {
    expect(
      shippingAddressLines({
        name: "Jo Rivera",
        line1: "12 Ridge Rd",
        line2: null,
        city: "Bend",
        region: "OR",
        postal_code: "97701",
        country: "",
      }),
    ).toEqual(["Jo Rivera", "12 Ridge Rd", "Bend, OR 97701"]);
  });

  test("is empty for a meetup or a purged address", () => {
    expect(
      shippingAddressLines({
        name: null,
        line1: null,
        line2: null,
        city: null,
        region: null,
        postal_code: null,
        country: null,
      }),
    ).toEqual([]);
  });
});
