import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
} from "@/components/ui/sidebar";
import { NewEventDialog } from "./events/new-event-dialog";
import { AddDonationModal } from "./home/add-donation-modal";
import type { PortalRole } from "@/lib/auth/roles";
import { hasAnyRole } from "@/lib/auth/roles";

export function SidebarQuickActions({ roles }: { roles: readonly PortalRole[] }) {
  const canCreateEvent = hasAnyRole(roles, ["admin", "event_coordinator"]);
  const canRecordDonation = hasAnyRole(roles, ["admin", "finance", "volunteer"]);

  if (!canCreateEvent && !canRecordDonation) return null;

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Quick actions</SidebarGroupLabel>
      <SidebarGroupContent className="flex flex-col gap-2 px-2">
        {canCreateEvent && <NewEventDialog />}
        {canRecordDonation && <AddDonationModal />}
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
