// Unit coverage for which of `loadEventViewer()`'s states a session lands in.
//
// The RPCs themselves, and the RLS that decides what they return, are covered
// against a real database by `event-registration-actions.integration.test.ts`.
// What belongs here is the branch: a signed-in account with no `people` row
// used to be indistinguishable from a signed-out visitor, and #1257 is the
// distinction.
import { describe, expect, mock, test } from "bun:test";
import type { MyContactDetails } from "@/lib/constituent/contact";

type FakeUser = {
  email?: string | null;
  user_metadata?: Record<string, unknown>;
};

let user: FakeUser | null = null;
let contactRows: Partial<MyContactDetails>[] = [];
let registrationRows: unknown[] = [];
let waiverRows: unknown[] = [];

mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user } }) },
    rpc: async (name: string) =>
      name === "my_contact_details"
        ? { data: contactRows }
        : name === "my_waiver_on_file"
          ? { data: waiverRows }
          : { data: registrationRows },
  }),
}));

const { loadEventViewer } = await import("./my-registration");

function session(next: FakeUser | null) {
  user = next;
  contactRows = [];
  registrationRows = [];
  waiverRows = [];
}

describe("loadEventViewer", () => {
  test("a visitor with no session is still nobody", async () => {
    session(null);

    expect(await loadEventViewer("event-1")).toBeNull();
  });

  test("an account with no approved claim carries its own fields", async () => {
    session({
      email: "jane@example.com",
      user_metadata: { full_name: "Jane Rivers" },
    });

    expect(await loadEventViewer("event-1")).toEqual({
      kind: "account",
      account: { email: "jane@example.com", name: "Jane Rivers" },
    });
  });

  test("falls back through the provider's other name keys", async () => {
    session({ email: "jane@example.com", user_metadata: { name: "Jane" } });
    expect(await loadEventViewer("event-1")).toMatchObject({
      account: { name: "Jane" },
    });

    session({ email: "jane@example.com", user_metadata: { full_name: "  " } });
    expect(await loadEventViewer("event-1")).toMatchObject({
      account: { name: null },
    });

    session({ email: "jane@example.com" });
    expect(await loadEventViewer("event-1")).toMatchObject({
      account: { name: null },
    });
  });

  test("a linked person still arrives with their record and registration", async () => {
    session({ email: "jane@example.com" });
    contactRows = [{ person_id: "p1", name: "Jane Rivers" }];
    registrationRows = [{ registration_id: "r1", party_size: 2 }];

    const viewer = await loadEventViewer("event-1");

    expect(viewer).toMatchObject({
      kind: "linked",
      person: { person_id: "p1" },
      registration: { registration_id: "r1", party_size: 2 },
    });
  });

  test("a linked person who has not registered has no registration", async () => {
    session({ email: "jane@example.com" });
    contactRows = [{ person_id: "p1" }];

    expect(await loadEventViewer("event-1")).toMatchObject({
      kind: "linked",
      registration: null,
    });
  });

  // #1401. The RPC returns a row only for the version in force, so the loader
  // has nothing to compare -- it passes the row on, or null.
  test("a linked person carries the agreement they have on file", async () => {
    session({ email: "jane@example.com" });
    contactRows = [{ person_id: "p1" }];
    waiverRows = [{ version: 3, accepted_at: "2026-10-04T17:00:00Z" }];

    expect(await loadEventViewer("event-1")).toMatchObject({
      kind: "linked",
      waiverOnFile: { version: 3, accepted_at: "2026-10-04T17:00:00Z" },
    });
  });

  test("a linked person with nothing on file is asked in full", async () => {
    session({ email: "jane@example.com" });
    contactRows = [{ person_id: "p1" }];

    expect(await loadEventViewer("event-1")).toMatchObject({
      kind: "linked",
      waiverOnFile: null,
    });
  });
});
