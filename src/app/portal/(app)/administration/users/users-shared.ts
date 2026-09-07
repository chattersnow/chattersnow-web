import { personDisplayName } from "@/lib/format";

export type PortalUser = {
  user_id: string;
  email: string | null;
  /** Name from the identity provider's metadata (e.g. the Google account). */
  full_name: string | null;
  /** The linked public.people row, null until the account first signs in. */
  person_id: string | null;
  preferred_name: string | null;
  person_name: string | null;
  roles: string[];
  created_at: string;
  deactivated_at: string | null;
  /**
   * The account also belongs to another organization (#707 Phase 4).
   * Deactivation is platform-wide, so such an account is removed from this
   * organization instead.
   */
  shared_account: boolean;
};

export type PortalRoleOption = {
  id: string;
  name: string;
  description: string | null;
};

export type PendingGrant = {
  id: string;
  email: string;
  name: string | null;
  status: "pending" | "claimed" | "revoked";
  expires_at: string | null;
  created_at: string;
  invited_at: string | null;
  roles: { name: string };
};

/** A time-boxed support membership in this organization (#707 Phase 4). */
export type SupportGrant = {
  id: string;
  user_id: string;
  email: string | null;
  reason: string | null;
  expires_at: string | null;
  created_at: string;
  created_by_email: string | null;
  roles: string[];
};

/** How long a support grant may run, as the dialog offers it. */
export const SUPPORT_DURATIONS = [
  { days: 1, label: "1 day" },
  { days: 7, label: "1 week" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
] as const;

/**
 * The display rule for a portal user: their preferred name, else the name on
 * their People row, else whatever the identity provider supplied, else their
 * email. Lives here rather than in actions.ts because that module is
 * "use server" and may only export async functions.
 */
export function portalUserDisplayName(portalUser: PortalUser): string {
  return personDisplayName({
    preferred_name: portalUser.preferred_name,
    name: portalUser.person_name ?? portalUser.full_name,
    email: portalUser.email,
  });
}
