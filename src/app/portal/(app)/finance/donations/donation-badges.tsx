import { StatusBadge, type StatusTone } from "@/components/portal/status-badge";
import { paymentMethodLabel, type PaymentMethod } from "./donations-shared";

const METHOD_STYLES: Record<PaymentMethod, StatusTone> = {
  cash: "progress",
  check: "progress",
  card: "info",
  bank_transfer: "info",
  online: "neutral",
  other: "neutral",
};

export function PaymentMethodBadge({ method }: { method: PaymentMethod }) {
  return (
    <StatusBadge tone={METHOD_STYLES[method] ?? "neutral"}>
      {paymentMethodLabel(method)}
    </StatusBadge>
  );
}
