// #1082 Phase 2. The envelope is the thing a second consumer branches on, so
// what is pinned here is the contract: which code a given refusal carries, and
// that the message stays the portal's own display copy rather than becoming a
// developer sentence.
import { describe, expect, test } from "bun:test";
import {
  actionError,
  fromGuard,
  fromParseError,
} from "@/lib/portal/action-result";

describe("actionError", () => {
  test("carries the code and the message", () => {
    expect(actionError("conflict", "Already gone.")).toEqual({
      error: { code: "conflict", message: "Already gone." },
    });
  });

  test("omits `fields` entirely when there are none", () => {
    // Not `fields: undefined`: the envelope is serialized across the Server
    // Action boundary and read by consumers that check for the key.
    const result = actionError("server_error", "Boom.");
    expect("fields" in result.error).toBe(false);
  });

  test("includes `fields` when given", () => {
    expect(
      actionError("invalid_input", "Name it.", { name: "Name it." }),
    ).toEqual({
      error: {
        code: "invalid_input",
        message: "Name it.",
        fields: { name: "Name it." },
      },
    });
  });
});

describe("fromGuard", () => {
  test("keeps the guard's own message as the display copy", () => {
    // checkUser and checkAnyPermission write messages for the person at the
    // intake table. Phase 2 adds a code; it must not reword them.
    expect(
      fromGuard("unauthenticated", {
        error: "You must be signed in to record a donation.",
      }),
    ).toEqual({
      error: {
        code: "unauthenticated",
        message: "You must be signed in to record a donation.",
      },
    });
  });

  test("takes the code from the caller, not from the string", () => {
    // The two guards answer with different strings per action, so the code
    // cannot be inferred from the message without a lookup that would drift.
    expect(fromGuard("forbidden", { error: "Nope." }).error.code).toBe(
      "forbidden",
    );
  });
});

describe("fromParseError", () => {
  test("is always invalid_input", () => {
    expect(fromParseError({ error: "Pick a thing." })).toEqual({
      error: { code: "invalid_input", message: "Pick a thing." },
    });
  });

  test("promotes a named field into `fields`", () => {
    expect(
      fromParseError({ error: "Select an inventory item.", field: "itemId" }),
    ).toEqual({
      error: {
        code: "invalid_input",
        message: "Select an inventory item.",
        fields: { itemId: "Select an inventory item." },
      },
    });
  });

  test("leaves `fields` off when the parser named nothing", () => {
    // Most parsers still return a bare message, and a form that shows it at
    // the top is the behaviour those paths had before.
    const result = fromParseError({ error: "Something is wrong." });
    expect("fields" in result.error).toBe(false);
  });
});
