import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { revenueSourceLabel, type RevenueSource } from "./revenue-shared";

const SOURCE_STYLES: Record<RevenueSource, string> = {
  ticket_sales: "bg-primary/10 text-primary",
  registration_fees: "bg-primary/10 text-primary",
  merchandise: "bg-secondary text-secondary-foreground",
  onsite_donations: "bg-secondary text-secondary-foreground",
  grants: "bg-muted text-muted-foreground",
  other: "bg-muted text-muted-foreground",
};

function Pill({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function RevenueSourceBadge({ source }: { source: RevenueSource }) {
  return (
    <Pill className={SOURCE_STYLES[source] ?? "bg-muted text-muted-foreground"}>
      {revenueSourceLabel(source)}
    </Pill>
  );
}
