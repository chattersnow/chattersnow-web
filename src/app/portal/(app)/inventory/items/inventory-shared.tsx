import { cn } from "@/lib/utils";
import {
  CONDITIONS,
  GENDERS,
  labelFor,
  resolveImageUrl,
} from "@/lib/inventory";

export { CONDITIONS, GENDERS, labelFor, resolveImageUrl };

export type InventoryItem = {
  id: string;
  description: string;
  type: string;
  size: string | null;
  gender: string | null;
  condition: string;
  face_value: number | string | null;
  status: string;
  photo_url: string | null;
  notes: string | null;
};

export const STATUSES = [
  { value: "available", label: "Available" },
  { value: "distributed", label: "Distributed" },
  { value: "damaged", label: "Damaged" },
  { value: "lost", label: "Lost" },
  { value: "retired", label: "Retired" },
  { value: "other", label: "Other" },
];

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export function formatFaceValue(value: number | string | null) {
  if (value === null || value === undefined) return "—";
  const numeric = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(numeric) ? currencyFormatter.format(numeric) : "—";
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        status === "available" && "bg-primary/10 text-primary",
        status !== "available" && "bg-muted text-muted-foreground",
      )}
    >
      {labelFor(STATUSES, status)}
    </span>
  );
}
