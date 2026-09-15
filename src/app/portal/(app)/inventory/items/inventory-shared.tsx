import { cn } from "@/lib/utils";
import type { HideBelow } from "@/components/ui/table";
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
  /** Free text the requester left on the public gear request (#721). */
  holdNotes?: string | null;
  /**
   * The request behind the hold (#1032), when there is one: manual holds and
   * pre-header reservations have none, and the modal shows the movement's
   * own requester instead.
   */
  holdRequest?: {
    id: string;
    status: string;
    delivery_method: string;
    quoted_amount: number | string | null;
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

// Eight columns is a desk table. Description, category and status are what the
// list is read for; the rest come back in the item's own edit modal, and the
// gallery view is the other way to read an item on a phone.
export const SORT_COLUMNS: {
  key: SortColumn;
  label: string;
  hideBelow?: HideBelow;
}[] = [
  { key: "description", label: "Description" },
  { key: "category", label: "Category" },
  { key: "size", label: "Size", hideBelow: "md" },
  { key: "gender", label: "Gender", hideBelow: "lg" },
  { key: "condition", label: "Condition", hideBelow: "lg" },
  { key: "face_value", label: "Face value", hideBelow: "md" },
  { key: "status", label: "Status" },
  { key: "intended_use", label: "Intended use", hideBelow: "lg" },
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
