import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const TABLE_LABELS: Record<string, string> = {
  donations: "Donations",
  inventory_items: "Inventory items",
  inventory_movements: "Inventory movements",
  event_expenses: "Event expenses",
  user_roles: "User roles",
  app_settings: "App settings",
};

const ACTION_STYLES: Record<string, string> = {
  insert: "bg-secondary text-secondary-foreground",
  update: "bg-primary/10 text-primary",
  delete: "bg-destructive/10 text-destructive",
};

function Pill({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize",
        className
      )}
    >
      {children}
    </span>
  );
}

export function ActionBadge({ action }: { action: string }) {
  return <Pill className={ACTION_STYLES[action] ?? "bg-muted text-muted-foreground"}>{action}</Pill>;
}
