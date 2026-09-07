import type { ComponentType, ReactNode } from "react";
import type { PermissionCheck, PermissionMap } from "@/lib/auth/permissions";
import { hasAnyPermission } from "@/lib/auth/permissions";
import type { PersonRow, RoleKey } from "../people-shared";

/**
 * Something a person can do next in one of their roles.
 *
 * `access` carries the permission of the module that owns the relationship --
 * finance for a receipt, volunteers for a shift -- not people:manage. Before
 * the registry, people:manage was the only permission the People pages knew
 * about, so emailing a donor a tax receipt and assigning a volunteer to a
 * shift were indistinguishable authorities.
 *
 * Named `access`, and "any one of these grants it", to match the two registries
 * this codebase already has: QuickAction (sidebar-quick-actions.tsx) and
 * NavItem (lib/portal/nav.ts).
 */
export type PersonAspectAction = {
  key: string;
  label: string;
  href: string;
  access: readonly PermissionCheck[];
};

export type PersonAspect = {
  /** The person flag that turns this aspect on. */
  key: RoleKey;
  /** Names the aspect's action group for screen readers, e.g. "Donor". */
  label: string;
  HistoryCard: ComponentType<{ personId: string; actions?: ReactNode }>;
  actions: readonly PersonAspectAction[];
};

/**
 * The aspects that apply to a person, in registry order.
 *
 * Keyed on the role flag alone. Card *visibility* deliberately does not depend
 * on the owning module's permission: the donations and volunteer cards have
 * always been readable by anyone holding people:view, and narrowing that would
 * hide history from roles that can see it today -- a product decision rather
 * than part of this refactor. The per-module gate applies to actions, which
 * are new.
 *
 * Filtering on the flag is only trustworthy because the flags are derived from
 * the records that create each role -- read straight off people_with_roles
 * (20260903030000): a person without is_donor provably has no donations, so
 * this hides only cards that would have rendered empty.
 *
 * Partner is the one flag narrower than its card's query: is_partner means a
 * *won* opportunity (20260905020000), so an organization still in the pipeline
 * holds no flag while PartnerCard would have had rows to show. That history is
 * not lost -- [id]/partnerships-card.tsx picks it up for exactly the people
 * this filter drops. Narrow a derivation again and the same care is owed, or
 * the registry starts hiding cards that would not have been empty.
 */
export function aspectsFor(
  aspects: readonly PersonAspect[],
  person: Pick<PersonRow, RoleKey>,
): PersonAspect[] {
  return aspects.filter((aspect) => person[aspect.key]);
}

export function allowedActions(
  aspect: Pick<PersonAspect, "actions">,
  permissions: PermissionMap,
): PersonAspectAction[] {
  return aspect.actions.filter((action) =>
    hasAnyPermission(permissions, action.access),
  );
}
