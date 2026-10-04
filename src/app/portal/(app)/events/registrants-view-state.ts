import { PAGE_SIZE_OPTIONS, parsePage, parsePerPage } from "@/lib/pagination";
import {
  answerRowsToAnswers,
  missingRequiredQuestions,
  type RegistrationQuestion,
} from "@/lib/registration-questions";
import type { EventRegistrant } from "./registrants-actions";

/**
 * What the registrants page is showing, as its URL says (#1511).
 *
 * Search, filters, sort and page all live in the query string so a link, a
 * reload or the back button lands on the same rows. Pure, so the round trip
 * can be tested without a router; the page reads it with `useSearchParams`
 * and writes it back with `router.replace`.
 */
export type RegistrantFlag = "minor" | "no-photos";

export type RegistrantsView = {
  q: string;
  /** A registration option's id: only the parties that chose it. */
  option: string | null;
  /** `in` / `out` for checked in or not yet; null for both. */
  checkedIn: "in" | "out" | null;
  /** Only registrations with a required question left blank (#1502). */
  missing: boolean;
  /** Any of these, not all: a door shift asks "who needs a second look". */
  flags: RegistrantFlag[];
  sort: { key: string; dir: "asc" | "desc" } | null;
  page: number;
  perPage: number;
};

/**
 * Twenty-five rather than the portal's ten: this is the door's list, and a
 * Chatter Snow event's twenty registrations should be one page, not two.
 */
export const REGISTRANTS_PER_PAGE: (typeof PAGE_SIZE_OPTIONS)[number] = 25;

const FLAGS: readonly RegistrantFlag[] = ["minor", "no-photos"];

const KEYS = {
  q: "q",
  option: "option",
  checkedIn: "checkedIn",
  missing: "missing",
  flags: "flags",
  sort: "sort",
  dir: "dir",
  page: "page",
  perPage: "perPage",
} as const;

export function parseRegistrantsView(
  params: Pick<URLSearchParams, "get">,
): RegistrantsView {
  const checkedIn = params.get(KEYS.checkedIn);
  const sortKey = params.get(KEYS.sort);
  const perPage = params.get(KEYS.perPage);
  return {
    q: params.get(KEYS.q) ?? "",
    option: params.get(KEYS.option) || null,
    checkedIn: checkedIn === "in" || checkedIn === "out" ? checkedIn : null,
    missing: params.get(KEYS.missing) === "1",
    flags: (params.get(KEYS.flags) ?? "")
      .split(",")
      .filter((flag): flag is RegistrantFlag =>
        FLAGS.includes(flag as RegistrantFlag),
      ),
    sort: sortKey
      ? { key: sortKey, dir: params.get(KEYS.dir) === "desc" ? "desc" : "asc" }
      : null,
    page: parsePage(params.get(KEYS.page) ?? undefined),
    perPage: perPage ? parsePerPage(perPage) : REGISTRANTS_PER_PAGE,
  };
}

/**
 * `base` with `patch` applied, defaults dropped so a fresh page has a bare
 * URL. Anything but a page change sends the reader back to page one: a page
 * number means nothing against a different set of rows.
 */
export function registrantsViewParams(
  base: URLSearchParams,
  patch: Partial<RegistrantsView>,
): URLSearchParams {
  const next = { ...parseRegistrantsView(base), ...patch };
  if (!("page" in patch)) next.page = 1;

  const params = new URLSearchParams(base);
  const put = (key: string, value: string | null) => {
    if (value) params.set(key, value);
    else params.delete(key);
  };
  put(KEYS.q, next.q.trim() ? next.q : null);
  put(KEYS.option, next.option);
  put(KEYS.checkedIn, next.checkedIn);
  put(KEYS.missing, next.missing ? "1" : null);
  put(KEYS.flags, next.flags.length > 0 ? next.flags.join(",") : null);
  put(KEYS.sort, next.sort?.key ?? null);
  put(KEYS.dir, next.sort?.dir === "desc" ? "desc" : null);
  put(KEYS.page, next.page > 1 ? String(next.page) : null);
  put(
    KEYS.perPage,
    next.perPage === REGISTRANTS_PER_PAGE ? null : String(next.perPage),
  );
  return params;
}

/** Whether any filter narrows the list, search included. */
export function isFiltered(view: RegistrantsView): boolean {
  return (
    view.q.trim() !== "" ||
    view.option !== null ||
    view.checkedIn !== null ||
    view.missing ||
    view.flags.length > 0
  );
}

/** Whether a registration has left a required question it was shown blank. */
export function isMissingRequired(
  registrant: EventRegistrant,
  questions: readonly RegistrationQuestion[],
): boolean {
  return (
    missingRequiredQuestions(questions, answerRowsToAnswers(registrant.answers))
      .length > 0
  );
}

export function matchesQuery(
  registrant: EventRegistrant,
  needle: string,
): boolean {
  return [registrant.name, registrant.email, registrant.phone].some(
    (field) => field?.toLowerCase().includes(needle) ?? false,
  );
}

export function choseOption(
  registrant: EventRegistrant,
  optionId: string,
): boolean {
  return registrant.option_counts.some(
    (row) => row.option_id === optionId && row.quantity > 0,
  );
}

function hasFlag(registrant: EventRegistrant, flag: RegistrantFlag): boolean {
  // The same two conditions the badges under the name render on: only the
  // notable state counts, never "nobody was asked".
  return flag === "minor"
    ? registrant.party_includes_minor === true
    : registrant.photo_consent === false;
}

export function filterRegistrants(
  list: readonly EventRegistrant[],
  view: RegistrantsView,
  questions: readonly RegistrationQuestion[],
): EventRegistrant[] {
  const needle = view.q.trim().toLowerCase();
  const asksRequired = questions.some((question) => question.required);
  return list.filter(
    (registrant) =>
      (!needle || matchesQuery(registrant, needle)) &&
      (view.option === null || choseOption(registrant, view.option)) &&
      (view.checkedIn === null ||
        (view.checkedIn === "in") === (registrant.checked_in_at !== null)) &&
      // A stale toggle on an event whose last required question was removed
      // filters nothing, rather than everything.
      (!view.missing ||
        !asksRequired ||
        isMissingRequired(registrant, questions)) &&
      (view.flags.length === 0 ||
        view.flags.some((flag) => hasFlag(registrant, flag))),
  );
}
