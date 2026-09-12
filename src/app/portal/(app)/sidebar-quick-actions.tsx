"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import {
  QuickActionDialog,
  permittedQuickActions,
  selfPersonFor,
} from "./quick-actions";
import type { EnsuredPerson } from "@/lib/auth/current-person";
import { hasPermission, type PermissionMap } from "@/lib/auth/permissions";

const COOKIE_NAME = "quick_actions_state";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

/**
 * Above which count the group starts closed. An admin passes every gate and
 * got all six -- roughly 330px of stacked buttons that pushed the nav tree
 * below the fold on a laptop (#979). One or two actions crowd nothing, and
 * collapsing a single row behind a click only costs a click, so the threshold
 * decides rather than a flat default. Either way the reader's own choice, once
 * they make one, outranks it.
 */
const CROWDS_THE_NAV_ABOVE = 2;

export function SidebarQuickActions({
  permissions,
  currentPerson,
  defaultOpen,
}: {
  permissions: PermissionMap;
  currentPerson?: EnsuredPerson | null;
  /** The reader's remembered choice, or undefined before they have made one. */
  defaultOpen?: boolean;
}) {
  const actions = permittedQuickActions(permissions);
  const [open, setOpen] = useState(
    defaultOpen ?? actions.length <= CROWDS_THE_NAV_ABOVE,
  );

  if (actions.length === 0) return null;

  function handleOpenChange(next: boolean) {
    setOpen(next);
    // Persisted the way the sidebar's own open state is (ui/sidebar.tsx): a
    // cookie, so the layout can read it on the server and the group renders
    // in the remembered state rather than flipping after hydration.
    document.cookie = `${COOKIE_NAME}=${next}; path=/; max-age=${COOKIE_MAX_AGE}`;
  }

  const selfPerson = selfPersonFor(currentPerson);
  const canManageVolunteers = hasPermission(
    permissions,
    "volunteers",
    "manage",
  );

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <Collapsible open={open} onOpenChange={handleOpenChange}>
        <SidebarGroupLabel
          render={<CollapsibleTrigger />}
          className="w-full cursor-pointer justify-between"
        >
          Quick actions
          <ChevronDown
            aria-hidden
            className={cn("transition-transform", open && "rotate-180")}
          />
        </SidebarGroupLabel>
        <CollapsibleContent>
          {/* The triggers come from dialogs that live on their own module pages,
              where each picked its own Button variant (default, secondary, ...).
              Six of those stacked here read as a wall of buttons and crowd the
              nav, so normalize them to one quiet outline style. Descendant
              selectors outrank the variant's own utility classes, which keeps the
              override here rather than adding a variant prop to five dialogs. */}
          <SidebarGroupContent className="flex flex-col gap-1.5 px-2 pt-1 [&_button]:h-8 [&_button]:w-full [&_button]:justify-start [&_button]:border [&_button]:border-sidebar-border [&_button]:bg-transparent [&_button]:font-normal [&_button]:text-sidebar-foreground [&_button]:shadow-none [&_button:hover]:bg-sidebar-accent">
            {actions.map((action) => (
              <QuickActionDialog
                key={action.key}
                action={action}
                selfPerson={selfPerson}
                canManageVolunteers={canManageVolunteers}
              />
            ))}
          </SidebarGroupContent>
        </CollapsibleContent>
      </Collapsible>
    </SidebarGroup>
  );
}
