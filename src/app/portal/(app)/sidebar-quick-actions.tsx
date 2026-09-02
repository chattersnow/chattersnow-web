import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
} from "@/components/ui/sidebar";
import { NewEventDialog } from "./events/new-event-dialog";
import { AddDonationModal } from "./home/add-donation-modal";
import {
  hasPermission,
  hasAnyPermission,
  type PermissionMap,
} from "@/lib/auth/permissions";

export function SidebarQuickActions({
  permissions,
}: {
  permissions: PermissionMap;
}) {
  const canCreateEvent = hasPermission(permissions, "events", "manage");
  const canRecordDonation = hasAnyPermission(permissions, [
    { resource: "finance", level: "manage" },
    { resource: "inventory_intake", level: "manage" },
  ]);

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
