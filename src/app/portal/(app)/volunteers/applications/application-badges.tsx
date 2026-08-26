import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { VolunteerApplicationStatus } from "./application-types";

const STATUS_STYLES: Record<VolunteerApplicationStatus, string> = {
  new: "bg-primary/10 text-primary",
  contacted: "bg-muted text-muted-foreground",
  placed: "bg-secondary text-secondary-foreground",
  declined: "bg-destructive/10 text-destructive",
  closed: "bg-muted text-muted-foreground",
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
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function VolunteerApplicationStatusBadge({
  status,
}: {
  status: VolunteerApplicationStatus;
}) {
  return (
    <Pill className={STATUS_STYLES[status] ?? "bg-muted text-muted-foreground"}>
      {status}
    </Pill>
  );
}
