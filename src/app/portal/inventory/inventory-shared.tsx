import { cn } from "@/lib/utils";

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

export const CONDITIONS = [
  { value: "new", label: "New" },
  { value: "like_new", label: "Like new" },
  { value: "good", label: "Good" },
  { value: "fair", label: "Fair" },
  { value: "poor", label: "Poor" },
];

export const GENDERS = [
  { value: "unisex", label: "Unisex" },
  { value: "men", label: "Men" },
  { value: "women", label: "Women" },
  { value: "kids", label: "Kids" },
  { value: "other", label: "Other" },
];

export const STATUSES = [
  { value: "available", label: "Available" },
  { value: "distributed", label: "Distributed" },
  { value: "damaged", label: "Damaged" },
  { value: "lost", label: "Lost" },
  { value: "retired", label: "Retired" },
  { value: "other", label: "Other" },
];

/**
 * Google Drive "share" links (e.g. /file/d/ID/view, ?id=ID) point at Drive's
 * HTML viewer page, not the raw image, so they can't be used as an <img>/
 * <Image> src directly. Rewrite them to Drive's thumbnail endpoint, which
 * serves the actual image bytes for anyone-with-the-link files.
 */
export function resolveImageUrl(url: string | null): string | null {
  if (!url) return null;
  if (!url.includes("drive.google.com")) return url;

  const fileId =
    url.match(/\/file\/d\/([^/]+)/)?.[1] ?? url.match(/[?&]id=([^&]+)/)?.[1];
  if (!fileId) return url;

  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`;
}

export function labelFor(options: { value: string; label: string }[], value: string | null) {
  if (!value) return null;
  return options.find((option) => option.value === value)?.label ?? value;
}

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
        status !== "available" && "bg-muted text-muted-foreground"
      )}
    >
      {labelFor(STATUSES, status)}
    </span>
  );
}
