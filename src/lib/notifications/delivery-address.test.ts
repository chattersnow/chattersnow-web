import { describe, expect, test } from "bun:test";
import { deliveryAddress } from "./delivery-address";

describe("deliveryAddress", () => {
  test("uses the sign-in address when there is no override", () => {
    expect(
      deliveryAddress({ email: "avery@gmail.test", notification_email: null }),
    ).toBe("avery@gmail.test");
  });

  test("prefers the override, which is the whole point of the column", () => {
    expect(
      deliveryAddress({
        email: "avery@gmail.test",
        notification_email: "avery@chattersnow.test",
      }),
    ).toBe("avery@chattersnow.test");
  });

  // The column is normalized to null rather than '' by a trigger
  // (20260914010000), so an empty string never reaches here from the database.
  // Asserted anyway: if one ever did, an empty To: is a delivery failure, and
  // falling back is the recoverable reading of it.
  test("falls back when the override is empty", () => {
    expect(
      deliveryAddress({ email: "avery@gmail.test", notification_email: "" }),
    ).toBe("avery@gmail.test");
  });

  test("has nowhere to send when the person has neither", () => {
    expect(
      deliveryAddress({ email: null, notification_email: null }),
    ).toBeNull();
  });
});
