import { describe, expect, test } from "bun:test";
import { formatAddress } from "./postal-address";

describe("formatAddress", () => {
  test("joins a whole address", () => {
    expect(
      formatAddress({
        address_line1: "12 Ridge Road",
        address_line2: "Apt 4",
        address_city: "Hunter",
        address_region: "NY",
        address_postal_code: "12442",
        address_country: "USA",
      }),
    ).toBe("12 Ridge Road, Apt 4, Hunter, NY 12442, USA");
  });

  // The common case on a record staff typed from a conversation: a city and
  // nothing else. The point of dropping empty parts is that this reads as an
  // address rather than as a row of placeholders.
  test("drops the parts that are missing", () => {
    expect(formatAddress({ address_city: "Hunter" })).toBe("Hunter");
    expect(
      formatAddress({ address_city: "Hunter", address_postal_code: "12442" }),
    ).toBe("Hunter 12442");
    expect(
      formatAddress({ address_line1: "12 Ridge Road", address_country: "USA" }),
    ).toBe("12 Ridge Road, USA");
  });

  test("is null when there is nothing to show", () => {
    expect(formatAddress({})).toBeNull();
    expect(
      formatAddress({ address_line1: "  ", address_city: null }),
    ).toBeNull();
  });
});
