import type { RoleKey } from "../people-shared";
import type { PersonAspectAction } from "./types";

/**
 * Where each role's work actually happens. Kept as data in its own module, free
 * of component imports, so the permission gating can be unit-tested without
 * pulling next/headers into the test graph.
 *
 * Every `access` list mirrors the guard on the page it links to, so a visible
 * link is always a page the viewer can open -- the same invariant
 * sidebar-quick-actions.tsx documents. The route-parity test in
 * aspect-actions.test.ts holds these in step with lib/portal/nav.ts.
 *
 * None of these carry the person: no target page supports a person filter yet.
 * Adding one later is a one-line change here.
 */
export const ASPECT_ACTIONS: Record<RoleKey, readonly PersonAspectAction[]> = {
  is_donor: [
    {
      key: "money-donations",
      label: "Money donations",
      href: "/portal/finance/donations",
      access: [{ resource: "finance", level: "manage" }],
    },
    {
      key: "gear-donations",
      label: "Gear donations",
      href: "/portal/inventory/donations",
      access: [
        { resource: "inventory", level: "view" },
        { resource: "inventory_intake", level: "manage" },
      ],
    },
  ],
  // event_sponsors rows are managed from an event's Sponsors tab, and there is
  // no `sponsors` resource -- events owns this relationship.
  is_sponsor: [
    {
      key: "events",
      label: "Events",
      href: "/portal/events",
      access: [{ resource: "events", level: "view" }],
    },
  ],
  is_volunteer: [
    {
      key: "participation",
      label: "Participation",
      href: "/portal/volunteers/participation",
      // volunteer_hours_logging:manage is deliberately NOT here. It is a
      // carve-out on the log-hours Server Action, not on the page: the
      // Volunteers layout still requires volunteers:view, so offering the
      // link to a hours-logging-only user would send them to the denied
      // screen. The route-parity test enforces this.
      access: [{ resource: "volunteers", level: "view" }],
    },
  ],
  is_attendee: [
    {
      key: "events",
      label: "Events",
      href: "/portal/events",
      access: [{ resource: "events", level: "view" }],
    },
  ],
  // event_staff rows are managed from an event's Staff tab, for the same
  // reason event_sponsors are: events owns the relationship and there is no
  // `staff` resource.
  is_staff: [
    {
      key: "events",
      label: "Events",
      href: "/portal/events",
      access: [{ resource: "events", level: "view" }],
    },
  ],
  // The pipeline that makes someone a partner lives in Governance, and there
  // is no `partners` resource -- governance owns this relationship.
  is_partner: [
    {
      key: "partnerships",
      label: "Partnerships",
      href: "/portal/governance/partnerships",
      access: [{ resource: "governance", level: "manage" }],
    },
  ],
};
