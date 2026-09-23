/**
 * Printable asset-tag labels (#1420 part 2): the paper they go on, and which
 * label lands in which cell. Pure, so the print page and its tests share it;
 * the QR and barcode images themselves are drawn server-side in
 * `inventory-label-codes.ts`.
 *
 * Measurements are inches, because that is how every one of these products is
 * sold. The sheets are the two common US Letter formats a nonprofit already
 * has in a drawer, named by the Avery stock numbers people search for; any
 * brand sold as "compatible" with those numbers shares the geometry.
 */

export type LabelLayoutKey = "sheet-30" | "sheet-10" | "roll";

export type LabelLayout = {
  key: LabelLayoutKey;
  name: string;
  description: string;
  /** The printed page: a whole sheet, or one label on a roll. */
  page: { width: number; height: number };
  label: { width: number; height: number };
  columns: number;
  rows: number;
  /** Distance from the page's top-left corner to the first label. */
  marginTop: number;
  marginLeft: number;
  /** Space between neighbouring labels. */
  gapX: number;
  gapY: number;
};

export const LABEL_LAYOUTS: readonly LabelLayout[] = [
  {
    key: "sheet-30",
    name: "Sheet of 30",
    description: "1 × 2⅝ in, US Letter (Avery 5160 / 8160)",
    page: { width: 8.5, height: 11 },
    label: { width: 2.625, height: 1 },
    columns: 3,
    rows: 10,
    marginTop: 0.5,
    marginLeft: 0.1875,
    gapX: 0.125,
    gapY: 0,
  },
  {
    key: "sheet-10",
    name: "Sheet of 10",
    description: "2 × 4 in, US Letter (Avery 5163 / 8163)",
    page: { width: 8.5, height: 11 },
    label: { width: 4, height: 2 },
    columns: 2,
    rows: 5,
    marginTop: 0.5,
    marginLeft: 0.15625,
    gapX: 0.1875,
    gapY: 0,
  },
  {
    // A thermal label printer prints one label per "page", sized to the
    // label. 2¼ × 1¼ in is the common address/shipping roll (Dymo 30334,
    // and the equivalent Brother and Zebra stock).
    key: "roll",
    name: "Label printer",
    description: "One 2¼ × 1¼ in label at a time",
    page: { width: 2.25, height: 1.25 },
    label: { width: 2.25, height: 1.25 },
    columns: 1,
    rows: 1,
    marginTop: 0,
    marginLeft: 0,
    gapX: 0,
    gapY: 0,
  },
];

export const DEFAULT_LABEL_LAYOUT: LabelLayoutKey = "sheet-30";

/** The most items one print run takes, so the URL stays a reasonable size. */
export const MAX_LABEL_ITEMS = 150;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function labelLayoutFor(key: string | undefined): LabelLayout {
  return (
    LABEL_LAYOUTS.find((layout) => layout.key === key) ??
    LABEL_LAYOUTS.find((layout) => layout.key === DEFAULT_LABEL_LAYOUT)!
  );
}

export function labelsPerPage(layout: LabelLayout): number {
  return layout.columns * layout.rows;
}

export type LabelOptions = {
  itemIds: string[];
  layout: LabelLayout;
  /**
   * Cells to leave blank at the start of the first sheet, so a sheet with
   * some labels already peeled off can go back through the printer. Always 0
   * on a roll.
   */
  skip: number;
  /** Add a Code128 of the bare code, for a scanner that reads only 1D. */
  barcode: boolean;
};

/**
 * The print page's query string, read defensively: anything but a uuid is
 * dropped rather than sent to Postgres to fail the cast, duplicates keep their
 * first position, and `skip` is clamped to what the first sheet can hold.
 */
export function parseLabelOptions(params: {
  items?: string;
  layout?: string;
  skip?: string;
  barcode?: string;
}): LabelOptions {
  const itemIds = [
    ...new Set(
      (params.items ?? "")
        .split(",")
        .map((id) => id.trim().toLowerCase())
        .filter((id) => UUID_PATTERN.test(id)),
    ),
  ].slice(0, MAX_LABEL_ITEMS);
  const layout = labelLayoutFor(params.layout);
  const requestedSkip = Number.parseInt(params.skip ?? "", 10);
  const skip =
    Number.isFinite(requestedSkip) && requestedSkip > 0
      ? Math.min(requestedSkip, labelsPerPage(layout) - 1)
      : 0;
  return { itemIds, layout, skip, barcode: params.barcode === "1" };
}

/**
 * The labels laid out page by page: `null` is a cell left blank, whether
 * skipped at the start or unused at the end of the last sheet. An empty list
 * yields no pages.
 */
export function paginateLabels<T>(
  labels: readonly T[],
  layout: LabelLayout,
  skip = 0,
): (T | null)[][] {
  if (labels.length === 0) return [];
  const perPage = labelsPerPage(layout);
  const cells: (T | null)[] = [
    ...Array<null>(Math.min(Math.max(skip, 0), perPage - 1)).fill(null),
    ...labels,
  ];
  const pages: (T | null)[][] = [];
  for (let start = 0; start < cells.length; start += perPage) {
    const page = cells.slice(start, start + perPage);
    while (page.length < perPage) page.push(null);
    pages.push(page);
  }
  return pages;
}

/** The print page for these items, from anywhere in the portal. */
export function labelsHref(itemIds: readonly string[]): string {
  return `/portal/inventory/items/labels?items=${itemIds.join(",")}`;
}
