import { describe, expect, test } from "bun:test";
import {
  isShiftMissingRole,
  signupRoleLabel,
  type ShiftRoleRef,
} from "./volunteer-roles";

const rideBuddyShift: ShiftRoleRef = {
  id: "shift-1",
  role_type: { name: "Ride Buddy" },
};
const rolelessShift: ShiftRoleRef = { id: "shift-2", role_type: null };
const shifts = [rideBuddyShift, rolelessShift];

describe("signupRoleLabel", () => {
  test("prefers the assigned shift's role type over the free text", () => {
    expect(
      signupRoleLabel({ role: "Greeter", shift_id: "shift-1" }, shifts),
    ).toBe("Ride Buddy");
  });

  test("falls back to the free text when the shift has no role type", () => {
    expect(
      signupRoleLabel({ role: "Greeter", shift_id: "shift-2" }, shifts),
    ).toBe("Greeter");
  });

  test("falls back to the free text when there is no shift", () => {
    expect(signupRoleLabel({ role: "Greeter", shift_id: null }, shifts)).toBe(
      "Greeter",
    );
  });

  test("falls back to the free text when the shift is not in the list", () => {
    expect(
      signupRoleLabel({ role: "Greeter", shift_id: "shift-gone" }, shifts),
    ).toBe("Greeter");
  });

  test("returns null when neither a shift nor free text resolves", () => {
    expect(signupRoleLabel({ role: null, shift_id: null }, shifts)).toBeNull();
    expect(signupRoleLabel({ role: "", shift_id: null }, shifts)).toBeNull();
    expect(
      signupRoleLabel({ role: null, shift_id: "shift-2" }, shifts),
    ).toBeNull();
  });

  test("returns null for a person with no signup", () => {
    expect(signupRoleLabel(null, shifts)).toBeNull();
  });
});

describe("isShiftMissingRole", () => {
  test("is true only when an assigned shift has no role type", () => {
    expect(
      isShiftMissingRole({ role: "Greeter", shift_id: "shift-2" }, shifts),
    ).toBe(true);
  });

  test("is false when the assigned shift has a role type", () => {
    expect(
      isShiftMissingRole({ role: null, shift_id: "shift-1" }, shifts),
    ).toBe(false);
  });

  test("is false when there is no shift, no match, or no signup", () => {
    expect(
      isShiftMissingRole({ role: "Greeter", shift_id: null }, shifts),
    ).toBe(false);
    expect(
      isShiftMissingRole({ role: "Greeter", shift_id: "shift-gone" }, shifts),
    ).toBe(false);
    expect(isShiftMissingRole(null, shifts)).toBe(false);
  });
});
