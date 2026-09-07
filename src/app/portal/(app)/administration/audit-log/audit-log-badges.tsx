import {
  humanizeStatus,
  StatusBadge,
  type StatusTone,
} from "@/components/portal/status-badge";

export const TABLE_LABELS: Record<string, string> = {
  donations: "Donations",
  inventory_items: "Inventory items",
  inventory_movements: "Inventory movements",
  events: "Events",
  event_expenses: "Event expenses",
  user_roles: "User roles",
  app_settings: "App settings",
  calendar_items: "Calendar items",
  content_opportunities: "Content opportunities",
  content_permissions: "Content permissions",
  services: "Services",
  assets: "Assets",
  access_grants: "Access grants",
};

const ACTION_STYLES: Record<string, StatusTone> = {
  insert: "info",
  update: "progress",
  delete: "danger",
};

export function ActionBadge({ action }: { action: string }) {
  return (
    <StatusBadge tone={ACTION_STYLES[action] ?? "neutral"}>
      {humanizeStatus(action)}
    </StatusBadge>
  );
}
