import { describe, expect, test } from "bun:test";
import { parseMyHoursForm, MAX_SELF_LOGGED_HOURS } from "./hours";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const VALID = { hours: "4", loggedDate: "2026-09-12" };

describe("parseMyHoursForm", () => {
  test("takes the fields the RPC asks for, and nothing else", () => {
    const parsed = parseMyHoursForm(
      form({
        ...VALID,
        eventId: "7f1c0f0a-0000-4000-8000-000000000000",
        roleTypeId: "7f1c0f0a-0000-4000-8000-000000000001",
        notes: "  Lift line all morning  ",
      }),
    );
    expect(parsed).toEqual({
      args: {
        p_hours: 4,
        p_logged_date: "2026-09-12",
        p_event_id: "7f1c0f0a-0000-4000-8000-000000000000",
        p_volunteer_role_type_id: "7f1c0f0a-0000-4000-8000-000000000001",
        p_notes: "Lift line all morning",
      },
    });
  });

  test("an unchosen event or role is null, not an empty string", () => {
    const parsed = parseMyHoursForm(form({ ...VALID, eventId: "", notes: "" }));
    expect(parsed).toEqual({
      args: {
        p_hours: 4,
        p_logged_date: "2026-09-12",
        p_event_id: null,
        p_volunteer_role_type_id: null,
        p_notes: null,
      },
    });
  });

  test("hours are required, positive, and capped at one day", () => {
    expect(parseMyHoursForm(form({ loggedDate: VALID.loggedDate }))).toEqual({
      error: "How many hours did you volunteer?",
    });
    expect(parseMyHoursForm(form({ ...VALID, hours: "0" }))).toHaveProperty(
      "error",
    );
    expect(parseMyHoursForm(form({ ...VALID, hours: "-2" }))).toHaveProperty(
      "error",
    );
    expect(parseMyHoursForm(form({ ...VALID, hours: "abc" }))).toHaveProperty(
      "error",
    );
    expect(
      parseMyHoursForm(
        form({ ...VALID, hours: String(MAX_SELF_LOGGED_HOURS + 1) }),
      ),
    ).toHaveProperty("error");
  });

  test("quarter hours, because that is what the ledger stores", () => {
    expect(parseMyHoursForm(form({ ...VALID, hours: "1.25" }))).toHaveProperty(
      "args",
    );
    expect(parseMyHoursForm(form({ ...VALID, hours: "1.3" }))).toEqual({
      error: "Round to the nearest quarter hour.",
    });
  });

  test("a day is a calendar date or nothing", () => {
    expect(parseMyHoursForm(form({ hours: "4" }))).toEqual({
      error: "Which day did you volunteer?",
    });
    expect(
      parseMyHoursForm(form({ hours: "4", loggedDate: "last Saturday" })),
    ).toEqual({ error: "Which day did you volunteer?" });
  });
});
