/**
 * URL parameter the notification email (#742) links one application with.
 *
 * Here rather than beside the sheet that consumes it because the page reading
 * it is a Server Component: a non-component export from a "use client" module
 * reaches the server as a client-reference proxy, not as the string, so
 * `searchParams[APPLICATION_PARAM]` silently resolved to undefined.
 */
export const APPLICATION_PARAM = "application";

export const VOLUNTEER_APPLICATION_STATUSES = [
  "new",
  "being reviewed",
  "contacted",
  "placed",
  "declined",
  "closed",
] as const;
export type VolunteerApplicationStatus =
  (typeof VOLUNTEER_APPLICATION_STATUSES)[number];

export type VolunteerApplication = {
  id: string;
  /**
   * Always present: `submit_volunteer_application()` resolves or creates the
   * person before it inserts. Typed nullable anyway because the column's
   * composite foreign key is what guarantees it, and the screening lookup
   * (#1360) keys on it.
   */
  person_id: string | null;
  name: string;
  email: string;
  phone: string | null;
  pronouns: string | null;
  role_interest: string | null;
  availability: string | null;
  status: VolunteerApplicationStatus;
  created_at: string;
};
