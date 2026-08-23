import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { ExpenseStatus } from "./expenses-shared";

const STATUS_STYLES: Record<ExpenseStatus, string> = {
  submitted: "bg-muted text-muted-foreground",
  approved: "bg-primary/10 text-primary",
  rejected: "bg-destructive/10 text-destructive",
  paid: "bg-secondary text-secondary-foreground",
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

export function ExpenseStatusBadge({ status }: { status: ExpenseStatus }) {
  return <Pill className={STATUS_STYLES[status] ?? "bg-muted text-muted-foreground"}>{status}</Pill>;
}
