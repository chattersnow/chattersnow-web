/**
 * Longest-prefix route matching for portal help content. A key matches when
 * it equals the pathname or is a segment-boundary prefix of it, so
 * "/portal/calendar" matches "/portal/calendar/work-queue" but not
 * "/portal/calendars". The longest matching key wins, letting a specific
 * page's entry shadow its module's entry, which in turn shadows "/portal".
 */
export function resolveHelpKey(
  pathname: string,
  keys: readonly string[],
): string | null {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  let best: string | null = null;
  for (const key of keys) {
    if (normalized !== key && !normalized.startsWith(`${key}/`)) continue;
    if (best === null || key.length > best.length) best = key;
  }
  return best;
}
