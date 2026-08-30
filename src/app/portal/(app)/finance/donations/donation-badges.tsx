import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { paymentMethodLabel, type PaymentMethod } from "./donations-shared";

const METHOD_STYLES: Record<PaymentMethod, string> = {
  cash: "bg-primary/10 text-primary",
  check: "bg-primary/10 text-primary",
  card: "bg-secondary text-secondary-foreground",
  bank_transfer: "bg-secondary text-secondary-foreground",
  online: "bg-muted text-muted-foreground",
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

export function PaymentMethodBadge({ method }: { method: PaymentMethod }) {
  return (
    <Pill className={METHOD_STYLES[method] ?? "bg-muted text-muted-foreground"}>
      {paymentMethodLabel(method)}
    </Pill>
  );
}
