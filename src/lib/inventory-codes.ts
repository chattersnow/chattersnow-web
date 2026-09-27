import { parseNumberedTag } from "@/lib/inventory-tags";
import { MAX_LABEL_ITEMS, NUMBERED_CODES_PATH } from "@/lib/inventory-labels";

/**
 * The Codes page (#1450): every tag code in one list -- numbered codes, the
 * random asset tags on items, blanks printed ahead of intake, and NFC
 * serials. Pure, so the page, its actions and their tests read the URL the
 * same way; the list itself is `inventory_tag_codes()`.
 */

export const CODES_PATH = NUMBERED_CODES_PATH;

/** A random code on no item shows as its own kind: it is a blank label. */
export const CODE_KINDS = [
  { value: "numbered", label: "Numbered" },
  { value: "asset_tag", label: "Asset tag" },
  { value: "blank", label: "Blank" },
  { value: "nfc", label: "NFC" },
] as const;

export const CODE_STATES = [
  { value: "free", label: "Free" },
  { value: "blank", label: "Blank" },
  { value: "on_item", label: "On item" },
  { value: "retired", label: "Retired" },
] as const;

export const RETIRE_REASONS = [
  { value: "damaged", label: "Damaged" },
  { value: "lost", label: "Lost" },
  { value: "other", label: "Other" },
] as const;

export type CodeKind = (typeof CODE_KINDS)[number]["value"];
export type CodeState = (typeof CODE_STATES)[number]["value"];
export type RetireReason = (typeof RETIRE_REASONS)[number]["value"];

export function isRetireReason(value: unknown): value is RetireReason {
  return RETIRE_REASONS.some((reason) => reason.value === value);
}

export function codeKindLabel(kind: string): string {
  return CODE_KINDS.find((option) => option.value === kind)?.label ?? kind;
}

export function codeStateLabel(state: string): string {
  return CODE_STATES.find((option) => option.value === state)?.label ?? state;
}

export function retireReasonLabel(reason: string | null): string {
  return (
    RETIRE_REASONS.find((option) => option.value === reason)?.label ??
    reason ??
    ""
  );
}

export type CodeFilters = {
  kind: CodeKind | null;
  state: CodeState | null;
  neverPrinted: boolean;
  notWritten: boolean;
  /** A number range, for numbered codes only. */
  from: number | null;
  to: number | null;
  search: string;
};

export const EMPTY_CODE_FILTERS: CodeFilters = {
  kind: null,
  state: null,
  neverPrinted: false,
  notWritten: false,
  from: null,
  to: null,
  search: "",
};

/** The query parameters the filters live in, so a view can be shared. */
export const CODE_FILTER_PARAMS = [
  "kind",
  "state",
  "unprinted",
  "unwritten",
  "from",
  "to",
  "search",
] as const;

type Params = Partial<Record<string, string | undefined>>;

function wholeNumber(raw: string | undefined): number | null {
  if (!raw || !/^\s*\d{1,7}\s*$/.test(raw)) return null;
  const value = Number(raw);
  return value >= 1 ? value : null;
}

/**
 * The filters in a URL, read defensively: an unknown kind or state is no
 * filter, a number range is whole numbers from 1 put low to high, and the
 * search is trimmed and capped.
 */
export function parseCodeFilters(params: Params): CodeFilters {
  const kind = CODE_KINDS.find((option) => option.value === params.kind);
  const state = CODE_STATES.find((option) => option.value === params.state);
  let from = wholeNumber(params.from);
  let to = wholeNumber(params.to);
  if (from !== null && to !== null && from > to) [from, to] = [to, from];
  return {
    kind: kind?.value ?? null,
    state: state?.value ?? null,
    neverPrinted: params.unprinted === "1",
    notWritten: params.unwritten === "1",
    from,
    to,
    search: (params.search ?? "").trim().slice(0, 100),
  };
}

/** The filters back into query parameters, leaving out what is unset. */
export function codeFilterParams(filters: CodeFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.kind) params.set("kind", filters.kind);
  if (filters.state) params.set("state", filters.state);
  if (filters.neverPrinted) params.set("unprinted", "1");
  if (filters.notWritten) params.set("unwritten", "1");
  if (filters.from !== null) params.set("from", String(filters.from));
  if (filters.to !== null) params.set("to", String(filters.to));
  if (filters.search) params.set("search", filters.search);
  return params;
}

export function hasCodeFilters(filters: CodeFilters): boolean {
  return codeFilterParams(filters).size > 0;
}

/**
 * What a search for a code means as a number: `7`, `007`, `csn7`, `CSN-7`
 * and `CSN-007` all find CSN-007, the same forgiveness as assigning one
 * (#1444). A prefix, if typed, must be this tenant's, or it names another
 * organization's code and matches no number. Null when the search can't be
 * a numbered code.
 */
export function parseCodeSearch(
  search: string,
  prefix: string | null,
): number | null {
  const parsed = parseNumberedTag(search);
  if (!parsed) return null;
  if (parsed.prefix && parsed.prefix !== prefix) return null;
  return parsed.number;
}

/**
 * `inventory_tag_codes()`'s arguments for these filters, leaving out what is
 * unset so the function's defaults apply. A number range narrows to numbered
 * codes, since nothing else has a number.
 */
export type CodeQueryArgs = {
  p_kinds?: string[];
  p_states?: string[];
  p_never_printed: boolean;
  p_not_written: boolean;
  p_number_from?: number;
  p_number_to?: number;
  p_search?: string;
  p_search_number?: number;
};

export function codeQueryArgs(
  filters: CodeFilters,
  prefix: string | null,
): CodeQueryArgs {
  const ranged = filters.from !== null || filters.to !== null;
  const searchNumber = filters.search
    ? parseCodeSearch(filters.search, prefix)
    : null;
  return {
    p_kinds: filters.kind ? [filters.kind] : ranged ? ["numbered"] : undefined,
    p_states: filters.state ? [filters.state] : undefined,
    p_never_printed: filters.neverPrinted,
    p_not_written: filters.notWritten,
    p_number_from: filters.from ?? undefined,
    p_number_to: filters.to ?? undefined,
    p_search: filters.search || undefined,
    p_search_number: searchNumber ?? undefined,
  };
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Tag ids from a URL or a form, deduplicated, one print run at most. */
export function parseTagIds(raw: string | readonly string[] | undefined) {
  const list = typeof raw === "string" ? raw.split(",") : (raw ?? []);
  return [
    ...new Set(
      list
        .map((id) => id.trim().toLowerCase())
        .filter((id) => UUID_PATTERN.test(id)),
    ),
  ].slice(0, MAX_LABEL_ITEMS);
}

/** The list, filtered. */
export function codesHref(filters: CodeFilters = EMPTY_CODE_FILTERS): string {
  const query = codeFilterParams(filters).toString();
  return query ? `${CODES_PATH}?${query}` : CODES_PATH;
}

/**
 * The print view for these codes, or for everything the filters match. Any
 * mix of kinds prints together; `?numbers=` stays an alias for a range.
 */
export function codesPrintHref(
  target: { ids: readonly string[] } | { filters: CodeFilters },
): string {
  if ("ids" in target) {
    return `${CODES_PATH}?print=${target.ids.join(",")}`;
  }
  const params = codeFilterParams(target.filters);
  params.set("print", "filter");
  return `${CODES_PATH}?${params.toString()}`;
}

/** Codes an action targets: chosen rows, or every row the filters match. */
export type CodeTarget = { ids: string[] } | { filter: string };

export function formatCount(count: number, one: string, many = `${one}s`) {
  return `${count.toLocaleString("en-US")} ${count === 1 ? one : many}`;
}
