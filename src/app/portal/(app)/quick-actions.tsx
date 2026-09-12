"use client";

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
  type PermissionCheck,
  type PermissionMap,
} from "@/lib/auth/permissions";

export type QuickActionKey =
  | "gear-donation"
  | "distribution"
  | "volunteer-hours"
  | "expense"
  | "money-donation"
  | "new-event";

export type QuickAction = {
  key: QuickActionKey;
  /** Names the action in the sidebar button and in the command palette, so
   *  the two surfaces can never drift into calling it different things. */
  label: string;
  /** Same shape PortalNav uses to filter NAV_ITEMS: any one check passing
   *  shows the action. Each gate mirrors what the underlying Server Action
   *  already enforces, so a visible button is always a permitted one. */
  access: readonly PermissionCheck[];
};

/**
 * Ordered by how often the work happens, highest first -- permissions narrow
 * the list per role, so most people see one to three of these. Event-scoped
 * actions (check in, add sponsor) are deliberately absent: they need an event
 * chosen first and are offered in context on the dashboard's "Happening now"
 * card instead.
 *
 * Metadata only, with no JSX: the sidebar and the command palette both filter
 * this list, and the palette needs the labels to search against before it
 * renders anything.
 */
export const QUICK_ACTIONS: readonly QuickAction[] = [
  {
    key: "gear-donation",
    label: "Record gear donation",
    access: [{ resource: "inventory_intake", level: "manage" }],
  },
  {
    key: "distribution",
    label: "Record distribution",
    access: [
      { resource: "inventory", level: "manage" },
      { resource: "inventory_intake", level: "manage" },
    ],
  },
  {
    key: "volunteer-hours",
    label: "Log volunteer hours",
    access: [
      { resource: "volunteers", level: "manage" },
      { resource: "volunteer_hours_logging", level: "manage" },
    ],
  },
  {
    key: "expense",
    label: "Add expense",
    // createExpenseAction gates on event_expenses, not finance -- which is
    // why event coordinators get this even though the Finance section is
    // closed to them (their expenses show on the event's Expenses tab).
    access: [{ resource: "event_expenses", level: "manage" }],
  },
  {
    key: "money-donation",
    label: "Log donation",
    access: [{ resource: "finance", level: "manage" }],
  },
  {
    key: "new-event",
    label: "New event",
    access: [{ resource: "events", level: "manage" }],
  },
];

/** The one filter both surfaces use, so ⌘K offers exactly what the sidebar
 *  does -- never one action more. */
export function permittedQuickActions(permissions: PermissionMap) {
  return QUICK_ACTIONS.filter((action) =>
    hasAnyPermission(permissions, action.access),
  );
}

/**
 * LogHoursDialog wants a PickedPerson so it can pre-fill the picker with the
 * signed-in user; the layout resolved an EnsuredPerson, which keys the id
 * differently and carries no phone.
 */
export function selfPersonFor(
  currentPerson: EnsuredPerson | null | undefined,
): PickedPerson | null {
  if (!currentPerson) return null;
  return {
    id: currentPerson.person_id,
    name: currentPerson.name,
    preferred_name: currentPerson.preferred_name,
    email: currentPerson.email,
    phone: null,
  };
}

/**
 * One dialog, either way it was reached. The sidebar renders these with their
 * own trigger buttons; the command palette renders them trigger-less and
 * drives `open` itself, since it offers the action by name rather than by
 * button.
 */
export function QuickActionDialog({
  action,
  selfPerson,
  canManageVolunteers,
  open,
  onOpenChange,
  withTrigger = true,
}: {
  action: QuickAction;
  selfPerson: PickedPerson | null;
  canManageVolunteers: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  withTrigger?: boolean;
}) {
  const shared = {
    triggerLabel: action.label,
    open,
    onOpenChange,
    withTrigger,
  };

  switch (action.key) {
    case "gear-donation":
      return <AddDonationModal {...shared} />;
    case "distribution":
      return <RecordDistributionModal {...shared} />;
    case "volunteer-hours":
      return (
        <LogHoursDialog
          {...shared}
          selfPerson={selfPerson}
          canManage={canManageVolunteers}
        />
      );
    case "expense":
      return <NewExpenseDialog {...shared} />;
    case "money-donation":
      return <NewDonationDialog {...shared} />;
    case "new-event":
      return <NewEventDialog {...shared} />;
  }
}
