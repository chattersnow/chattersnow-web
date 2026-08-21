import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
} from "@/components/ui/sidebar";
import { NewEventDialog } from "./events/new-event-dialog";
import { AddDonationModal } from "./home/add-donation-modal";

export function SidebarQuickActions() {
  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Quick actions</SidebarGroupLabel>
      <SidebarGroupContent className="flex flex-col gap-2 px-2">
        <NewEventDialog />
        <AddDonationModal />
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
