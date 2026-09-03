import { Fragment, type ReactNode } from "react";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
} from "@/components/ui/sidebar";
import { NewEventDialog } from "./events/new-event-dialog";
import { AddDonationModal } from "./home/add-donation-modal";
import { RecordDistributionModal } from "./home/record-distribution-modal";
import { NewDonationDialog } from "./finance/donations/new-donation-dialog";
import { NewExpenseDialog } from "./finance/expenses/new-expense-dialog";
import { LogHoursDialog } from "./volunteers/participation/log-hours-dialog";
import type { PickedPerson } from "./people/person-picker";
import type { EnsuredPerson } from "@/lib/auth/current-person";
import {
  hasAnyPermission,
  hasPermission,
  type PermissionCheck,
  type PermissionMap,
} from "@/lib/auth/permissions";

type QuickAction = {
  key: string;
  /** Same shape PortalNav uses to filter NAV_ITEMS: any one check passing
   *  shows the action. Each gate mirrors what the underlying Server Action
   *  already enforces, so a visible button is always a permitted one. */
  access: readonly PermissionCheck[];
  render: () => ReactNode;
};

/**
 * Ordered by how often the work happens, highest first -- permissions narrow
 * the list per role, so most people see one to three of these. Event-scoped
 * actions (check in, add sponsor) are deliberately absent: they need an event
 * chosen first and are offered in context on the dashboard's "Happening now"
 * card instead.
 */
function buildQuickActions(
  selfPerson: PickedPerson | null,
  canManageVolunteers: boolean,
): QuickAction[] {
  return [
    {
      key: "gear-donation",
      access: [{ resource: "inventory_intake", level: "manage" }],
      render: () => <AddDonationModal triggerLabel="Record gear donation" />,
    },
    {
      key: "distribution",
      access: [
        { resource: "inventory", level: "manage" },
        { resource: "inventory_intake", level: "manage" },
      ],
      render: () => (
        <RecordDistributionModal triggerLabel="Record distribution" />
      ),
    },
    {
      key: "volunteer-hours",
      access: [
        { resource: "volunteers", level: "manage" },
        { resource: "volunteer_hours_logging", level: "manage" },
      ],
      render: () => (
        <LogHoursDialog
          selfPerson={selfPerson}
          canManage={canManageVolunteers}
          triggerLabel="Log volunteer hours"
        />
      ),
    },
    {
      key: "expense",
      // createExpenseAction gates on event_expenses, not finance -- which is
      // why event coordinators get this even though the Finance section is
      // closed to them (their expenses show on the event's Expenses tab).
      access: [{ resource: "event_expenses", level: "manage" }],
      render: () => <NewExpenseDialog triggerLabel="Add expense" />,
    },
    {
      key: "money-donation",
      access: [{ resource: "finance", level: "manage" }],
      render: () => <NewDonationDialog triggerLabel="Log donation" />,
    },
    {
      key: "new-event",
      access: [{ resource: "events", level: "manage" }],
      render: () => <NewEventDialog triggerLabel="New event" />,
    },
  ];
}

export function SidebarQuickActions({
  permissions,
  currentPerson,
}: {
  permissions: PermissionMap;
  currentPerson?: EnsuredPerson | null;
}) {
  // LogHoursDialog wants a PickedPerson so it can pre-fill the picker with the
  // signed-in user; the layout already resolved an EnsuredPerson, which keys
  // the id differently and carries no phone.
  const selfPerson: PickedPerson | null = currentPerson
    ? {
        id: currentPerson.person_id,
        name: currentPerson.name,
        preferred_name: currentPerson.preferred_name,
        email: currentPerson.email,
        phone: null,
      }
    : null;

  const actions = buildQuickActions(
    selfPerson,
    hasPermission(permissions, "volunteers", "manage"),
  ).filter((action) => hasAnyPermission(permissions, action.access));

  if (actions.length === 0) return null;

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Quick actions</SidebarGroupLabel>
      {/* The triggers come from dialogs that live on their own module pages,
          where each picked its own Button variant (default, secondary, ...).
          Six of those stacked here read as a wall of buttons and crowd the
          nav, so normalize them to one quiet outline style. Descendant
          selectors outrank the variant's own utility classes, which keeps the
          override here rather than adding a variant prop to five dialogs. */}
      <SidebarGroupContent className="flex flex-col gap-1.5 px-2 [&_button]:h-8 [&_button]:w-full [&_button]:justify-start [&_button]:border [&_button]:border-sidebar-border [&_button]:bg-transparent [&_button]:font-normal [&_button]:text-sidebar-foreground [&_button]:shadow-none [&_button:hover]:bg-sidebar-accent">
        {actions.map((action) => (
          <Fragment key={action.key}>{action.render()}</Fragment>
        ))}
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
