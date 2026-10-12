import { describe, expect, test } from "bun:test";
import { parseRetroItemForm, RETRO_BODY_MAX } from "./retro-form";

function formData(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe("parseRetroItemForm", () => {
  test("parses a went-well item with an area", () => {
    expect(
      parseRetroItemForm(
        formData({
          kind: "went_well",
          body: "  Ability groups ",
          area: "team",
        }),
      ),
    ).toEqual({
      data: {
        kind: "went_well",
        body: "Ability groups",
        area: "team",
        ownerPersonId: null,
      },
    });
  });

  test("keeps an owner on an action item only", () => {
    expect(
      parseRetroItemForm(
        formData({ kind: "action", body: "Print roster", ownerPersonId: "p1" }),
      ),
    ).toEqual({
      data: {
        kind: "action",
        body: "Print roster",
        area: null,
        ownerPersonId: "p1",
      },
    });
    expect(
      parseRetroItemForm(
        formData({ kind: "improve", body: "Sign-in", ownerPersonId: "p1" }),
      ),
    ).toEqual({
      data: {
        kind: "improve",
        body: "Sign-in",
        area: null,
        ownerPersonId: null,
      },
    });
  });

  test("rejects an unknown kind, an empty body, a long body and an unknown area", () => {
    expect(parseRetroItemForm(formData({ kind: "x", body: "a" }))).toEqual({
      error: "Choose a kind of item.",
    });
    expect(
      parseRetroItemForm(formData({ kind: "improve", body: " " })),
    ).toEqual({ error: "Write the item." });
    expect(
      parseRetroItemForm(
        formData({ kind: "improve", body: "a".repeat(RETRO_BODY_MAX + 1) }),
      ),
    ).toEqual({ error: `Keep the item under ${RETRO_BODY_MAX} characters.` });
    expect(
      parseRetroItemForm(formData({ kind: "improve", body: "a", area: "x" })),
    ).toEqual({ error: "Choose an area from the list." });
  });
});
