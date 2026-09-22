import { describe, expect, test } from "bun:test";
import { parseScreeningTierForm } from "./screening-tier-form";

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("parseScreeningTierForm", () => {
  test("accepts a name on its own", () => {
    expect(
      parseScreeningTierForm(form({ name: "Tier 1", isActive: "on" })),
    ).toEqual({
      data: {
        name: "Tier 1",
        description: null,
        sort_order: 0,
        is_active: true,
      },
    });
  });

  test("keeps a description and an order", () => {
    expect(
      parseScreeningTierForm(
        form({
          name: " Works with participants ",
          description:
            " Ride Buddy and any role pairing a volunteer with a participant. ",
          sortOrder: "20",
          isActive: "on",
        }),
      ),
    ).toEqual({
      data: {
        name: "Works with participants",
        description:
          "Ride Buddy and any role pairing a volunteer with a participant.",
        sort_order: 20,
        is_active: true,
      },
    });
  });

  test("treats a missing checkbox as retired", () => {
    const result = parseScreeningTierForm(form({ name: "Tier 0" }));
    expect("data" in result && result.data.is_active).toBe(false);
  });

  test("requires a name", () => {
    expect(parseScreeningTierForm(form({ name: "   " }))).toEqual({
      error: "A level name is required.",
      field: "name",
    });
  });

  test("rejects a non-integer order", () => {
    expect(
      parseScreeningTierForm(form({ name: "Tier 1", sortOrder: "1.5" })),
    ).toEqual({ error: "Order must be a whole number.", field: "sortOrder" });
  });
});
