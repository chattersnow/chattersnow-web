// #1082 Phase 1. See home/donation-core.test.ts for what these can prove.
//
// Check-in is the one path of the three that is a plain table update rather
// than a `security definer` RPC, so in production an under-privileged caller
// is refused by the `event_registrations` RLS policy -- silently, by matching
// no row. That silence is why the permission check here earns its keep: it is
// the difference between "you may not do that" and a button that appears to
// work and changes nothing.
import { describe, expect, test } from "bun:test";
import { checkInRegistrant, undoCheckIn } from "./registrant-core";
import { fakeSupabase } from "../../../../../test/fake-supabase";

const MANAGE = { events: "manage" as const };

describe("checkInRegistrant", () => {
  test("refuses a signed-out caller before touching the database", async () => {
    const supabase = fakeSupabase({ userId: null });

    const result = await checkInRegistrant(supabase.client, "reg-1");

    expect(result).toEqual({
      error: {
        code: "unauthenticated",
        message: "You must be signed in to check in a registrant.",
      },
    });
    expect(supabase.updates).toEqual([]);
  });

  test("refuses a caller without events:manage", async () => {
    const supabase = fakeSupabase({ permissions: { events: "view" } });

    const result = await checkInRegistrant(supabase.client, "reg-1");

    expect(result).toEqual({
      error: {
        code: "forbidden",
        message: "You don't have permission to perform this action.",
      },
    });
    expect(supabase.updates).toEqual([]);
  });

  test("stamps checked_in_at on the named registration", async () => {
    const supabase = fakeSupabase({ permissions: MANAGE });

    const result = await checkInRegistrant(supabase.client, "reg-1");

    expect(result).toEqual({ success: true });
    expect(supabase.updates).toHaveLength(1);
    const [update] = supabase.updates;
    expect(update.table).toBe("event_registrations");
    expect(update.eqColumn).toBe("id");
    expect(update.eqValue).toBe("reg-1");
    const checkedInAt = (update.values as { checked_in_at: string })
      .checked_in_at;
    expect(Number.isNaN(Date.parse(checkedInAt))).toBe(false);
  });

  test("turns an update failure into display copy", async () => {
    const supabase = fakeSupabase({
      permissions: MANAGE,
      updateError: { message: "connection reset" },
    });

    const result = await checkInRegistrant(supabase.client, "reg-1");

    expect(result).toEqual({
      error: {
        code: "server_error",
        message: "Could not check in this registrant. Please try again.",
      },
    });
  });
});

describe("undoCheckIn", () => {
  test("refuses a caller without events:manage", async () => {
    const supabase = fakeSupabase({ permissions: { events: "view" } });

    const result = await undoCheckIn(supabase.client, "reg-2");

    expect(result).toEqual({
      error: {
        code: "forbidden",
        message: "You don't have permission to perform this action.",
      },
    });
    expect(supabase.updates).toEqual([]);
  });

  test("clears checked_in_at on the named registration", async () => {
    const supabase = fakeSupabase({ permissions: MANAGE });

    const result = await undoCheckIn(supabase.client, "reg-2");

    expect(result).toEqual({ success: true });
    expect(supabase.updates).toEqual([
      {
        table: "event_registrations",
        values: { checked_in_at: null },
        eqColumn: "id",
        eqValue: "reg-2",
      },
    ]);
  });

  test("turns an update failure into display copy", async () => {
    const supabase = fakeSupabase({
      permissions: MANAGE,
      updateError: { message: "connection reset" },
    });

    const result = await undoCheckIn(supabase.client, "reg-2");

    expect(result).toEqual({
      error: {
        code: "server_error",
        message: "Could not undo this check-in. Please try again.",
      },
    });
  });
});
