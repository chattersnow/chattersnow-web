import { describe, expect, test } from "bun:test";
import { resolvePersonAccount } from "./person-account";
import type { PortalUser } from "../../administration/users/users-shared";

function user(overrides: Partial<PortalUser>): PortalUser {
  return {
    user_id: "u1",
    email: "jane@example.com",
    full_name: "Jane Doe",
    person_id: null,
    preferred_name: null,
    person_name: null,
    roles: [],
    created_at: "2026-01-01T00:00:00Z",
    deactivated_at: null,
    ...overrides,
  };
}

describe("resolvePersonAccount", () => {
  test("returns the account already linked to this person", () => {
    const { account, linkable } = resolvePersonAccount(
      "p1",
      "jane@example.com",
      [user({ user_id: "u1", person_id: "p1", roles: ["admin"] })],
    );

    expect(account?.user_id).toBe("u1");
    expect(account?.roles).toEqual(["admin"]);
    // Already linked, so there is nothing to offer linking.
    expect(linkable).toEqual([]);
  });

  test("offers an unlinked account whose email matches the person", () => {
    const { account, linkable } = resolvePersonAccount(
      "p1",
      "Jane@Example.com",
      [user({ user_id: "u1", email: "jane@example.com", person_id: null })],
    );

    expect(account).toBeNull();
    expect(linkable).toEqual([{ user_id: "u1", email: "jane@example.com" }]);
  });

  test("never offers an account already claimed by another person", () => {
    const { account, linkable } = resolvePersonAccount(
      "p1",
      "jane@example.com",
      [user({ user_id: "u1", email: "jane@example.com", person_id: "p2" })],
    );

    expect(account).toBeNull();
    expect(linkable).toEqual([]);
  });

  test("offers nothing when the person has no email to match on", () => {
    const { linkable } = resolvePersonAccount("p1", null, [
      user({ email: "jane@example.com" }),
    ]);

    expect(linkable).toEqual([]);
  });

  test("offers nothing when the caller is not an admin and got no rows", () => {
    const { account, linkable } = resolvePersonAccount(
      "p1",
      "jane@example.com",
      [],
    );

    expect(account).toBeNull();
    expect(linkable).toEqual([]);
  });
});
