import { cn } from "@/lib/utils";
import {
  CONDITIONS,
  categoryLabelFor,
  GENDERS,
  INTENDED_USES,
  labelFor,
  resolveImageUrl,
} from "@/lib/inventory";
import { formatCurrency } from "@/lib/format";

export {
  CONDITIONS,
  categoryLabelFor,
  GENDERS,
  INTENDED_USES,
  labelFor,
  resolveImageUrl,
};

export type InventoryItem = {
  id: string;
  description: string;
  /** Legacy free text / the "Other" category's detail -- see categoryLabelFor. */
  type: string | null;
  category_id: string | null;
  category_key: string | null;
  category_label: string | null;
  category_group_label: string | null;
  size: string | null;
  gender: string | null;
  condition: string;
  face_value: number | string | null;
  status: string;
  intended_use: string;
  photo_url: string | null;
  notes: string | null;
  holdRequester?: {
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
  } | null;
};

export type SortColumn =
  | "description"
  | "category"
  | "size"
  | "gender"
  | "condition"
  | "face_value"
  | "status"
  | "intended_use";

export const SORT_COLUMNS: { key: SortColumn; label: string }[] = [
  { key: "description", label: "Description" },
  { key: "category", label: "Category" },
  { key: "size", label: "Size" },
  { key: "gender", label: "Gender" },
  { key: "condition", label: "Condition" },
  { key: "face_value", label: "Face value" },
  { key: "status", label: "Status" },
  { key: "intended_use", label: "Intended use" },
];

export function isSortColumn(value: string | undefined): value is SortColumn {
  return !!value && SORT_COLUMNS.some((column) => column.key === value);
}

export const STATUSES = [
  { value: "available", label: "Available" },
  { value: "reserved", label: "Reserved" },
  { value: "distributed", label: "Distributed" },
  { value: "damaged", label: "Damaged" },
  { value: "lost", label: "Lost" },
  { value: "retired", label: "Retired" },
  { value: "other", label: "Other" },
];

export function IntendedUseBadge({ intendedUse }: { intendedUse: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        intendedUse === "gear_library" && "bg-primary/10 text-primary",
        intendedUse !== "gear_library" && "bg-muted text-muted-foreground",
      )}
    >
      {labelFor(INTENDED_USES, intendedUse)}
    </span>
  );
}

export function formatFaceValue(value: number | string | null) {
  return formatCurrency(value);
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
