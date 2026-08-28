import { describe, expect, test } from "bun:test";
import { checkUser } from "./current-user";

function fakeSupabase(user: { id: string } | null) {
  return { auth: { getUser: async () => ({ data: { user } }) } } as never;
}

describe("checkUser", () => {
  test("returns the user when signed in", async () => {
    const supabase = fakeSupabase({ id: "user-1" });
    await expect(checkUser(supabase)).resolves.toEqual({
      user: { id: "user-1" },
    } as never);
  });

  test("returns the default message when signed out", async () => {
    const supabase = fakeSupabase(null);
    await expect(checkUser(supabase)).resolves.toEqual({
      error: "You must be signed in.",
    });
  });

  test("returns a custom message when signed out", async () => {
    const supabase = fakeSupabase(null);
    await expect(
      checkUser(supabase, "You must be signed in to create an event."),
    ).resolves.toEqual({
      error: "You must be signed in to create an event.",
    });
  });
});
