import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type ProgramRow = {
  id: string;
  name: string;
  description: string | null;
  status: string;
};

const STATUS_STYLES: Record<string, string> = {
  active: "bg-secondary text-secondary-foreground",
  pilot: "bg-primary/10 text-primary",
  retired: "bg-muted text-muted-foreground",
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

export function ProgramStatusBadge({ status }: { status: string }) {
  return (
    <Pill className={STATUS_STYLES[status] ?? "bg-muted text-muted-foreground"}>
      {status}
    </Pill>
  );
}
