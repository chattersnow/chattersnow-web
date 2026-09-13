import { describe, expect, test } from "bun:test";
import {
  hashConfirmationToken,
  isConfirmationToken,
  mintConfirmationToken,
} from "./notification-email-token";

describe("mintConfirmationToken", () => {
  test("mints a token the shape check accepts", () => {
    const { token } = mintConfirmationToken();
    expect(isConfirmationToken(token)).toBe(true);
  });

  test("does not repeat itself", () => {
    const tokens = new Set(
      Array.from({ length: 50 }, () => mintConfirmationToken().token),
    );
    expect(tokens.size).toBe(50);
  });

  // What the database stores has to be the hash and not the token, or the
  // column is as good as the address itself to anyone who can read it.
  test("the hash it returns is the hash of the token, and is not the token", () => {
    const { token, hash } = mintConfirmationToken();
    expect(hash).toBe(hashConfirmationToken(token));
    expect(hash).not.toBe(token);
  });
});

describe("isConfirmationToken", () => {
  test("refuses anything that is not 64 hex characters", () => {
    expect(isConfirmationToken("")).toBe(false);
    expect(isConfirmationToken("nope")).toBe(false);
    expect(isConfirmationToken("a".repeat(63))).toBe(false);
    expect(isConfirmationToken("A".repeat(64))).toBe(false);
    expect(isConfirmationToken(`${"a".repeat(64)} `)).toBe(false);
  });
});
