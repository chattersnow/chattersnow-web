import { parsePage, parsePerPage } from "@/lib/pagination";
import { DELIVERY_STATUSES } from "@/lib/notifications/delivery-record";
import { DELIVERY_KIND_VALUES } from "./delivery-log-labels";

/**
 * The delivery log's filters, read from and written back to the URL (#1310),
 * on the same convention as audit-log-params.ts: every filter is a search
 * parameter, so a filtered view survives a reload and can be pasted to
 * somebody else. That matters more here than on most lists -- the thing an
 * administrator does with this screen is answer one person's question, and
 * the answer is a link.
 */

export const SORTABLE_COLUMNS = ["created_at", "kind", "status"] as const;
export type SortColumn = (typeof SORTABLE_COLUMNS)[number];

export type StatusFilter = (typeof DELIVERY_STATUSES)[number] | "all";

export type DeliveryLogParams = {
  sort: SortColumn;
  dir: "asc" | "desc";
  status: StatusFilter;
  kind: string;
  /** A recipient's name or address, matched loosely. */
  recipient: string;
  /**
   * The id of the record a send was about (#1310 section 3).
   *
   * Matched against `dedupe_key`, which is `<kind>:<record id>` by convention
   * for every event-triggered sender, because the ledger holds no foreign key
   * to the submission or registration behind a send. That makes this a
   * substring match rather than an equality one -- some keys carry a suffix
   * (a resend, a claim decision) after the id.
   */
  record: string;
  from: string;
  to: string;
  page: number;
  perPage: number;
};

function isSortColumn(value: string | undefined): value is SortColumn {
  return !!value && (SORTABLE_COLUMNS as readonly string[]).includes(value);
}

export function parseDeliveryLogParams(
  searchParams: Record<string, string | string[] | undefined>,
): DeliveryLogParams {
  const raw = (key: string) => {
    const value = searchParams[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const sortParam = raw("sort");
  const sort: SortColumn = isSortColumn(sortParam) ? sortParam : "created_at";
  const dir: "asc" | "desc" = raw("dir") === "asc" ? "asc" : "desc";

  const statusRaw = raw("status");
  const status: StatusFilter = (
    DELIVERY_STATUSES as readonly string[]
  ).includes(statusRaw ?? "")
    ? (statusRaw as StatusFilter)
    : "all";

  const kindRaw = raw("kind");
  const kind = DELIVERY_KIND_VALUES.includes(kindRaw ?? "")
    ? (kindRaw as string)
    : "all";

  return {
    sort,
    dir,
    status,
    kind,
    recipient: (raw("recipient") ?? "").trim(),
    record: (raw("record") ?? "").trim(),
    from: raw("from") || "",
    to: raw("to") || "",
    page: parsePage(raw("page")),
    perPage: parsePerPage(raw("perPage")),
  };
}

/** Whether the reader has narrowed anything, for the Clear button and badge. */
export function activeDeliveryLogFilters(
  filters: DeliveryLogParams,
): boolean[] {
  return [
    filters.status !== "all",
    filters.kind !== "all",
    !!filters.recipient,
    !!filters.record,
    !!filters.from,
    !!filters.to,
  ];
}
