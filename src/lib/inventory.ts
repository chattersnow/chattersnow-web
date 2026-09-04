export const CONDITIONS = [
  { value: "new", label: "New" },
  { value: "like_new", label: "Like new" },
  { value: "good", label: "Good" },
  { value: "fair", label: "Fair" },
  { value: "poor", label: "Poor" },
];

/**
 * What an item is for, not where it is in its lifecycle (that's `status`).
 * Only `gear_library` items reach the public catalog, the public request flow
 * and the gear-distribution picker; sponsor vouchers and similar prize stock
 * are `giveaway` so they stop reading as gear the community can take home.
 */
export const INTENDED_USES = [
  { value: "gear_library", label: "Gear library" },
  { value: "giveaway", label: "Giveaway prize" },
  { value: "internal", label: "Internal use" },
];

export const GENDERS = [
  { value: "unisex", label: "Unisex" },
  { value: "men", label: "Men" },
  { value: "women", label: "Women" },
  { value: "kids", label: "Kids" },
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

export function labelFor(
  options: { value: string; label: string }[],
  value: string | null,
) {
  if (!value) return null;
  return options.find((option) => option.value === value)?.label ?? value;
}
