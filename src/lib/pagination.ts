export const PAGE_SIZE = 50;

/**
 * Rows-per-page choices offered wherever a list paginates. Small on purpose:
 * the portal's lists are scanned, not browsed, and a 50-row wall was the
 * reason nobody could find anything. The first entry is the default, and the
 * rule for hiding the pager keys on it rather than on the current size --
 * hiding the selector because 20 rows happen to fit a 25-row page would take
 * away the only control that could put the reader back on 10.
 */
export const PAGE_SIZE_OPTIONS = [10, 25] as const;

export function parsePage(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export function pageRange(page: number, pageSize = PAGE_SIZE) {
  const offset = (page - 1) * pageSize;
  return { offset, to: offset + pageSize - 1 };
}

export function totalPagesFor(count: number | null, pageSize = PAGE_SIZE) {
  return count ? Math.max(1, Math.ceil(count / pageSize)) : 1;
}

export function buildHref(
  pathname: string,
  base: URLSearchParams,
  overrides: Record<string, string | number>,
) {
  const params = new URLSearchParams(base);
  for (const [key, value] of Object.entries(overrides)) {
    params.set(key, String(value));
  }
  return `${pathname}?${params.toString()}`;
}

/** Escapes ILIKE wildcard characters (and the escape character itself) so a
 * user-typed search term is matched literally rather than as a pattern. */
export function escapeLikePattern(term: string) {
  return term.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** Wraps an already-escaped `.ilike()` pattern in double quotes so it can be
 * embedded in a PostgREST `.or()`/`.and()` filter string without commas or
 * parentheses in the search term being parsed as filter syntax. */
export function quoteOrValue(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
