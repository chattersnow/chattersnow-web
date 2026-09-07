/**
 * How a volunteer signup's role is displayed. Three sources, in order of
 * authority: the shift it is tied to, the signup's own role type, and the
 * legacy free text `event_volunteers.role`. The first two are FKs to the
 * volunteer_role_types catalog (20260827040000 and 20260905050000); the free
 * text predates both and is read-only now, but existing rows still carry it.
 *
 * The events roster and the person detail card both need that rule, so it
 * lives here rather than in either of them.
 */

export type RoleTypeRef = { name: string } | null;
export type ShiftRoleRef = { id: string; role_type: RoleTypeRef };
export type SignupRoleRef = {
  role: string | null;
  shift_id: string | null;
  role_type?: RoleTypeRef;
};

/** Assigned to a shift that has no role type -- not the same as no role. */
export const NO_SHIFT_ROLE = "No role";

function assignedShift(
  signup: SignupRoleRef | null,
  shifts: readonly ShiftRoleRef[],
) {
  if (!signup?.shift_id) return undefined;
  return shifts.find((shift) => shift.id === signup.shift_id);
}

/**
 * The role a signup describes: its shift's role type, else its own, else the
 * free text it was given. Returns null when none resolve, so callers pick
 * their own placeholder (usually EMPTY_VALUE).
 */
export function signupRoleLabel(
  signup: SignupRoleRef | null,
  shifts: readonly ShiftRoleRef[],
): string | null {
  if (!signup) return null;
  return (
    assignedShift(signup, shifts)?.role_type?.name ??
    signup.role_type?.name ??
    (signup.role || null)
  );
}

/**
 * Whether a signup's shift is the authority on its role but has none set. The
 * events roster surfaces this as NO_SHIFT_ROLE, since there the gap is a
 * coordinator's to fix on the shift; the person profile has no such lever and
 * prefers the free text signupRoleLabel falls back to.
 */
export function isShiftMissingRole(
  signup: SignupRoleRef | null,
  shifts: readonly ShiftRoleRef[],
): boolean {
  const shift = assignedShift(signup, shifts);
  return shift !== undefined && !shift.role_type;
}
