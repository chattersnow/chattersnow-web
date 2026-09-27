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

export type LabelLayoutKey =
  "sheet-30" | "sheet-10" | "roll" | "katasymbol-50x30";

/**
 * How the labels reach the printer: the browser's print dialog, or drawn in
 * the browser and sent to a Katasymbol T50M Pro, which has no driver for the
 * dialog to find (#1447).
 */
export type LabelPrinter = "browser" | "katasymbol";

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
  printer: LabelPrinter;
};

const MM = 1 / 25.4;

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
    printer: "browser",
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
    printer: "browser",
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
    printer: "browser",
  },
  {
    // Die-cut 50 × 30 mm stock, 50 mm across the printhead. Sized in
    // millimetres because that is how this stock is sold.
    key: "katasymbol-50x30",
    name: "Katasymbol T50M Pro",
    description: "One 50 × 30 mm label at a time, read upright",
    page: { width: 50 * MM, height: 30 * MM },
    label: { width: 50 * MM, height: 30 * MM },
    columns: 1,
    rows: 1,
    marginTop: 0,
    marginLeft: 0,
    gapX: 0,
    gapY: 0,
    printer: "katasymbol",
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

/**
 * Which of an item's codes its label carries (#1444): the reusable numbered
 * code, or the permanent tag code. Either one is a QR and an NFC tag that
 * opens the item.
 */
export type LabelCodeKind = "numbered" | "tag";

export type LabelOptions = {
  itemIds: string[];
  /** Null when the link doesn't say, so the page picks. */
  codeKind: LabelCodeKind | null;
  layout: LabelLayout;
  /**
   * Cells to leave blank at the start of the first sheet, so a sheet with
   * some labels already peeled off can go back through the printer. Always 0
   * on a roll.
   */
  skip: number;
  /**
   * Add a Code128 of the bare code, for a scanner that reads only 1D. Never
   * on a Katasymbol label: at 8 dots per millimetre its bars beside the QR
   * would be too narrow to read.
   */
  barcode: boolean;
};

/**
 * The print page's query string, read defensively: anything but a uuid is
 * dropped rather than sent to Postgres to fail the cast, duplicates keep their
 * first position, and `skip` is clamped to what the first sheet can hold.
 */
export function parseLabelOptions(params: {
  items?: string;
  code?: string;
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
  return {
    itemIds,
    codeKind:
      params.code === "numbered" || params.code === "tag" ? params.code : null,
    layout,
    skip,
    barcode: params.barcode === "1" && layout.printer === "browser",
  };
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

/**
 * The intake label page (#1420 part 4), under Inventory -> Donations so the
 * intake volunteer can open it: one donation's items, or a batch of blank
 * codes printed ahead of time.
 */
export const INTAKE_LABELS_PATH = "/portal/inventory/donations/labels";

export function donationLabelsHref(donationId: string): string {
  return `${INTAKE_LABELS_PATH}?donation=${encodeURIComponent(donationId)}`;
}

export function blankLabelsHref(codes: readonly string[]): string {
  return `${INTAKE_LABELS_PATH}?codes=${codes.map(encodeURIComponent).join(",")}`;
}

const LABEL_CODE_PATTERN = /^[A-Z0-9]{4,16}$/;

/** `?codes=` read defensively, like `?items=`. */
export function parseLabelCodes(raw: string | undefined): string[] {
  return [
    ...new Set(
      (raw ?? "")
        .split(",")
        .map((code) => code.trim().toUpperCase())
        .filter((code) => LABEL_CODE_PATTERN.test(code)),
    ),
  ].slice(0, MAX_LABEL_ITEMS);
}

/** The print page for these items, from anywhere in the portal. */
export function labelsHref(
  itemIds: readonly string[],
  codeKind?: LabelCodeKind,
): string {
  const code = codeKind ? `&code=${codeKind}` : "";
  return `/portal/inventory/items/labels?items=${itemIds.join(",")}${code}`;
}

/**
 * Reusable numbered codes (#1444): the pool, and its labels. Under Items, so
 * the gate is `inventory:view`, like printing any other label.
 */
export const NUMBERED_CODES_PATH = "/portal/inventory/items/codes";

export type NumberRange = { from: number; to: number };

/** The page, or its print view for a range of numbers. */
export function numberedCodesHref(range?: NumberRange): string {
  return range
    ? `${NUMBERED_CODES_PATH}?numbers=${range.from}-${range.to}`
    : NUMBERED_CODES_PATH;
}

/**
 * `?numbers=1-50` (or a single `7`) read defensively: whole numbers from 1,
 * low to high, and no more than one print run's worth. Null when there is no
 * usable range.
 */
export function parseNumberRange(raw: string | undefined): NumberRange | null {
  const match = /^\s*(\d{1,7})\s*(?:-\s*(\d{1,7})\s*)?$/.exec(raw ?? "");
  if (!match) return null;
  const a = Number(match[1]);
  const b = match[2] === undefined ? a : Number(match[2]);
  const from = Math.min(a, b);
  const to = Math.max(a, b);
  if (from < 1) return null;
  return { from, to: Math.min(to, from + MAX_LABEL_ITEMS - 1) };
}
