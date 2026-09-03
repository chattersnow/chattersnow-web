import {
  hasAnyPermission,
  type PermissionCheck,
  type PermissionMap,
} from "@/lib/auth/permissions";

/**
 * The portal's navigation tree, shared by the sidebar (which renders it) and
 * the section index routes (which resolve a landing page from it). It lives
 * outside the client component so both read one definition: when they didn't,
 * /portal/finance redirected to a fixed child the sidebar already knew the
 * user couldn't open.
 *
 * Icons are deliberately absent -- they're a rendering concern, mapped by
 * `value` in portal-nav.tsx, so server code can import this without pulling
 * an icon library into its bundle.
 */
export type NavSubItem = {
  value: string;
  label: string;
  href: string;
  access: readonly PermissionCheck[];
};

export type NavItem = {
  value: string;
  label: string;
  href: string;
  basePath?: string;
  /** Omit for items always visible regardless of permissions (e.g. Dashboard). */
  access?: readonly PermissionCheck[];
  subItems?: readonly NavSubItem[];
};

export const NAV_ITEMS: readonly NavItem[] = [
  {
    value: "overview",
    label: "Dashboard",
    href: "/portal/home",
  },
  {
    value: "events",
    label: "Events",
    href: "/portal/events",
    access: [{ resource: "events", level: "view" }],
  },
  {
    value: "calendar",
    label: "Calendar",
    href: "/portal/calendar",
    basePath: "/portal/calendar",
    subItems: [
      {
        value: "items",
        label: "Calendar",
        href: "/portal/calendar",
        access: [{ resource: "content_calendar", level: "view" }],
      },
      {
        value: "work-queue",
        label: "Work queue",
        href: "/portal/calendar/work-queue",
        access: [{ resource: "content_calendar", level: "view" }],
      },
      {
        value: "templates",
        label: "Brief templates",
        href: "/portal/calendar/templates",
        access: [{ resource: "content_calendar", level: "manage" }],
      },
      {
        value: "program-suggestions",
        label: "Program suggestions",
        href: "/portal/calendar/program-suggestions",
        access: [{ resource: "content_calendar", level: "manage" }],
      },
      {
        value: "reports",
        label: "Annual Review",
        href: "/portal/calendar/reports",
        access: [{ resource: "content_calendar_reports", level: "view" }],
      },
      {
        value: "import",
        label: "Import",
        href: "/portal/calendar/import",
        access: [{ resource: "content_calendar", level: "manage" }],
      },
    ],
  },
  {
    value: "programs",
    label: "Programs",
    href: "/portal/programs",
    basePath: "/portal/programs",
    subItems: [
      {
        value: "list",
        label: "Programs",
        href: "/portal/programs",
        access: [{ resource: "programs", level: "view" }],
      },
      {
        value: "reports",
        label: "Impact Report",
        href: "/portal/programs/reports",
        access: [{ resource: "programs_reports", level: "view" }],
      },
    ],
  },
  {
    value: "inventory",
    label: "Inventory",
    href: "/portal/inventory/items",
    basePath: "/portal/inventory",
    subItems: [
      {
        value: "items",
        label: "Items",
        href: "/portal/inventory/items",
        access: [{ resource: "inventory", level: "view" }],
      },
      {
        value: "donations",
        label: "Donations",
        href: "/portal/inventory/donations",
        access: [
          { resource: "inventory", level: "view" },
          { resource: "inventory_intake", level: "manage" },
        ],
      },
      {
        value: "distribution",
        label: "Distribution",
        href: "/portal/inventory/distribution",
        access: [
          { resource: "inventory", level: "view" },
          { resource: "inventory_intake", level: "manage" },
        ],
      },
      {
        value: "reports",
        label: "Inventory Reports",
        href: "/portal/inventory/reports",
        access: [{ resource: "inventory_reports", level: "view" }],
      },
    ],
  },
  {
    value: "volunteers",
    label: "Volunteers",
    href: "/portal/volunteers/roles",
    basePath: "/portal/volunteers",
    subItems: [
      {
        value: "roles",
        label: "Roles",
        href: "/portal/volunteers/roles",
        access: [{ resource: "volunteers", level: "view" }],
      },
      {
        value: "participation",
        label: "Participation",
        href: "/portal/volunteers/participation",
        access: [{ resource: "volunteers", level: "view" }],
      },
      {
        value: "applications",
        label: "Applications",
        href: "/portal/volunteers/applications",
        access: [{ resource: "volunteers", level: "view" }],
      },
    ],
  },
  {
    value: "messages",
    label: "Messages",
    href: "/portal/communications",
    access: [{ resource: "communications", level: "view" }],
  },
  {
    value: "finance",
    label: "Finance",
    href: "/portal/finance/expenses",
    basePath: "/portal/finance",
    subItems: [
      {
        value: "expenses",
        label: "Expenses",
        href: "/portal/finance/expenses",
        access: [
          { resource: "finance", level: "manage" },
          { resource: "finance_approvals", level: "manage" },
        ],
      },
      {
        value: "revenue",
        label: "Revenue",
        href: "/portal/finance/revenue",
        access: [{ resource: "finance", level: "manage" }],
      },
      {
        value: "donations",
        label: "Donations",
        href: "/portal/finance/donations",
        access: [{ resource: "finance", level: "manage" }],
      },
      {
        value: "reimbursements",
        label: "Reimbursements",
        href: "/portal/finance/reimbursements",
        access: [
          { resource: "reimbursements", level: "manage" },
          { resource: "reimbursement_approvals", level: "manage" },
        ],
      },
      {
        value: "reports",
        label: "Financial Reports",
        href: "/portal/finance/reports",
        access: [{ resource: "finance_reports", level: "view" }],
      },
    ],
  },
  {
    value: "people",
    label: "People",
    href: "/portal/people",
    access: [{ resource: "people", level: "view" }],
  },
  {
    value: "donors",
    label: "Donors",
    href: "/portal/donors",
    access: [{ resource: "people", level: "view" }],
  },
  {
    value: "sponsors",
    label: "Sponsors",
    href: "/portal/sponsors",
    access: [{ resource: "people", level: "view" }],
  },
  {
    value: "attendees",
    label: "Attendees",
    href: "/portal/attendees",
    access: [{ resource: "people", level: "view" }],
  },
  {
    value: "governance",
    label: "Governance",
    href: "/portal/governance/board-members",
    basePath: "/portal/governance",
    subItems: [
      {
        value: "board-members",
        label: "Board Members",
        href: "/portal/governance/board-members",
        access: [{ resource: "governance", level: "manage" }],
      },
      {
        value: "meetings",
        label: "Meetings",
        href: "/portal/governance/meetings",
        access: [{ resource: "governance", level: "manage" }],
      },
      {
        value: "bylaws",
        label: "Bylaws",
        href: "/portal/governance/bylaws",
        access: [{ resource: "governance", level: "manage" }],
      },
      {
        value: "policies",
        label: "Policies",
        href: "/portal/governance/policies",
        access: [{ resource: "governance", level: "manage" }],
      },
      {
        value: "conflict-of-interest",
        label: "Conflict of Interest",
        href: "/portal/governance/conflict-of-interest",
        access: [{ resource: "governance", level: "manage" }],
      },
      {
        value: "annual-requirements",
        label: "Annual Requirements",
        href: "/portal/governance/annual-requirements",
        access: [{ resource: "governance", level: "manage" }],
      },
      {
        value: "nonprofit-status",
        label: "Nonprofit Status",
        href: "/portal/governance/nonprofit-status",
        access: [{ resource: "governance", level: "manage" }],
      },
      {
        value: "resolutions",
        label: "Resolutions",
        href: "/portal/governance/resolutions",
        access: [{ resource: "governance", level: "manage" }],
      },
      {
        value: "partnerships",
        label: "Partnerships",
        href: "/portal/governance/partnerships",
        access: [{ resource: "governance", level: "manage" }],
      },
      {
        value: "grants",
        label: "Grants",
        href: "/portal/governance/grants",
        access: [{ resource: "governance", level: "manage" }],
      },
    ],
  },
  {
    value: "administration",
    label: "Administration",
    href: "/portal/administration/users",
    basePath: "/portal/administration",
    subItems: [
      {
        value: "users",
        label: "Users",
        href: "/portal/administration/users",
        access: [{ resource: "administration", level: "manage" }],
      },
      {
        value: "roles",
        label: "Roles",
        href: "/portal/administration/roles",
        access: [{ resource: "administration", level: "manage" }],
      },
      {
        value: "access-management",
        label: "Access Management",
        href: "/portal/administration/access-management",
        access: [
          { resource: "administration", level: "manage" },
          { resource: "access_management_assets", level: "view" },
          { resource: "access_management_reviews", level: "view" },
        ],
      },
      {
        value: "permissions",
        label: "Permissions",
        href: "/portal/administration/permissions",
        access: [{ resource: "administration", level: "manage" }],
      },
      {
        value: "system-settings",
        label: "System Settings",
        href: "/portal/administration/system-settings",
        access: [
          { resource: "administration", level: "manage" },
          { resource: "system_settings", level: "manage" },
        ],
      },
      {
        value: "audit-log",
        label: "Audit Log",
        href: "/portal/administration/audit-log",
        access: [{ resource: "administration", level: "manage" }],
      },
    ],
  },
] as const;

/**
 * The nav section that owns `pathname`, or undefined when none does. Pages
 * outside the tree (/portal/account, /portal/welcome, the 404) used to fall
 * back to "overview", so the sidebar highlighted Dashboard while the user
 * was somewhere else.
 */
export function activeSectionFor(pathname: string): string | undefined {
  for (const item of NAV_ITEMS) {
    const testPath = item.basePath ?? item.href;
    if (pathname === testPath || pathname.startsWith(`${testPath}/`)) {
      return item.value;
    }
  }
  return undefined;
}

export function activeSubItemFor(
  pathname: string,
  item: NavItem,
): string | undefined {
  if (!item.subItems) return undefined;
  let best: NavSubItem | undefined;
  for (const sub of item.subItems) {
    if (pathname === sub.href || pathname.startsWith(`${sub.href}/`)) {
      if (!best || sub.href.length > best.href.length) best = sub;
    }
  }
  return best?.value;
}

/**
 * The nav tree reduced to what `permissions` can actually reach: sections with
 * no reachable sub-item are dropped, unreachable sub-items are removed, and a
 * section's href is rewritten to its first reachable sub-item.
 */
export function visibleNavItems(permissions: PermissionMap): NavItem[] {
  return NAV_ITEMS.filter((item) => {
    if (item.subItems)
      return item.subItems.some((sub) =>
        hasAnyPermission(permissions, sub.access),
      );
    return !item.access || hasAnyPermission(permissions, item.access);
  }).map((item) => {
    const subItems = item.subItems?.filter((sub) =>
      hasAnyPermission(permissions, sub.access),
    );
    const href =
      subItems &&
      subItems.length > 0 &&
      !subItems.some((s) => s.href === item.href)
        ? subItems[0].href
        : item.href;
    return {
      ...item,
      href,
      subItems: subItems && subItems.length > 0 ? subItems : undefined,
    };
  });
}

/**
 * The first page of `sectionValue` this user can open, or null when they can
 * open none of it. Section index routes redirect here rather than to a
 * hardcoded child, so a bookmark or typed URL lands where the sidebar would.
 */
export function firstAccessibleHref(
  permissions: PermissionMap,
  sectionValue: string,
): string | null {
  const item = visibleNavItems(permissions).find(
    (candidate) => candidate.value === sectionValue,
  );
  return item?.href ?? null;
}
