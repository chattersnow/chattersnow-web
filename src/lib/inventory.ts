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

/**
 * The controlled item category vocabulary (issue #667), replacing the free-text
 * `inventory_items.type`. Unlike CONDITIONS/GENDERS/INTENDED_USES above there is
 * no hardcoded list here: the vocabulary lives in `inventory_categories` /
 * `inventory_category_groups` and is admin-editable, so it always arrives as
 * data.
 */
export type InventoryCategory = {
  id: string;
  key: string;
  label: string;
  groupKey: string;
  groupLabel: string;
  isActive: boolean;
};

export type InventoryCategoryGroup = {
  key: string;
  label: string;
  categories: InventoryCategory[];
};

/** The one category whose meaning is "a human looked and nothing fit". */
export const OTHER_CATEGORY_KEY = "other";

/** Filter token for items that have no category at all. */
export const UNCATEGORIZED = "uncategorized";

export const UNCATEGORIZED_LABEL = "Uncategorized";

/**
 * The category columns every read site selects, whether from
 * `inventory_items_with_category` or a PostgREST embed.
 */
export type WithCategory = {
  type?: string | null;
  category_id?: string | null;
  category_key?: string | null;
  category_label?: string | null;
  category_group_label?: string | null;
};

/**
 * Flat rows (as they come back from the database, already ordered by group then
 * category) into the group/category shape a grouped <Select> renders. Preserves
 * the incoming order rather than re-sorting, since `sort_order` is admin-owned.
 */
export function groupInventoryCategories(
  categories: InventoryCategory[],
): InventoryCategoryGroup[] {
  const groups: InventoryCategoryGroup[] = [];
  const byKey = new Map<string, InventoryCategoryGroup>();

  for (const category of categories) {
    let group = byKey.get(category.groupKey);
    if (!group) {
      group = {
        key: category.groupKey,
        label: category.groupLabel,
        categories: [],
      };
      byKey.set(category.groupKey, group);
      groups.push(group);
    }
    group.categories.push(category);
  }

  return groups;
}

/**
 * What to show where the old code showed `item.type`.
 *
 * An "Other" item is displayed as its free-text detail rather than the literal
 * word "Other" — the detail is the informative half, and it is the reason the
 * legacy `type` column was kept rather than dropped. A row with no category at
 * all still shows whatever was typed before the vocabulary existed, and only
 * falls back to "Uncategorized" when there is nothing to show.
 */
export function categoryLabelFor(item: WithCategory): string {
  const detail = item.type?.trim() || null;
  if (item.category_key === OTHER_CATEGORY_KEY && detail) return detail;
  if (item.category_label) return item.category_label;
  return detail ?? UNCATEGORIZED_LABEL;
}

type CategoryRow = {
  id: string;
  key: string;
  label: string;
  is_active: boolean;
  sort_order: number;
  inventory_category_groups: {
    key: string;
    label: string;
    sort_order: number;
  } | null;
};

/**
 * Normalizes the PostgREST shape (`inventory_categories` with its group
 * embedded) into `InventoryCategory[]`, ordered by group then category.
 *
 * The ordering happens here rather than in the query because PostgREST cannot
 * order a row by a column of an embedded resource — the same limitation that
 * made `inventory_items_with_category` necessary for the items list.
 */
export function toInventoryCategories(rows: unknown): InventoryCategory[] {
  return ((rows ?? []) as CategoryRow[])
    .filter((row) => row.inventory_category_groups !== null)
    .sort((a, b) => {
      const groupA = a.inventory_category_groups!;
      const groupB = b.inventory_category_groups!;
      return (
        groupA.sort_order - groupB.sort_order ||
        a.sort_order - b.sort_order ||
        a.label.localeCompare(b.label)
      );
    })
    .map((row) => ({
      id: row.id,
      key: row.key,
      label: row.label,
      isActive: row.is_active,
      groupKey: row.inventory_category_groups!.key,
      groupLabel: row.inventory_category_groups!.label,
    }));
}

/**
 * Flattens a PostgREST embed of `inventory_categories` onto the row that
 * carries it, so a query that embeds the category reads the same as one that
 * selects from `inventory_items_with_category`.
 *
 * Both shapes exist on purpose: the items list needs the view (it sorts by
 * category, which an embed cannot do), while queries that already embed a
 * donation or a movement stay on the base table and embed one more level.
 */
export function flattenCategory<
  T extends {
    inventory_categories?: { key: string; label: string } | null;
  },
>(
  row: T,
): Omit<T, "inventory_categories"> & {
  category_key: string | null;
  category_label: string | null;
} {
  const { inventory_categories: category, ...rest } = row;
  return {
    ...rest,
    category_key: category?.key ?? null,
    category_label: category?.label ?? null,
  };
}
