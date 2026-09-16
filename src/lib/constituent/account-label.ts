/**
 * The name the public header greets an account by (#1175).
 *
 * Deliberately derived from the access token's claims and nothing else. The
 * portal's header uses `personDisplayName`, which reads `people.preferred_name`
 * -- the right answer there, where the shell has already loaded the signed-in
 * person's record for other reasons. On the public site nothing else needs that
 * row, and this control renders on *every* public page, so buying a preferred
 * name would mean an RPC and a `people` read on every visit to `/events`. The
 * greeting is a recognition cue, not a record; the record is at `/my`.
 *
 * Returns null when the claims carry nothing usable, and the caller shows the
 * generic label rather than a blank.
 */
export function accountLabel(claims: {
  email?: unknown;
  user_metadata?: { full_name?: unknown; name?: unknown } | null;
}): string | null {
  const metadata = claims.user_metadata ?? {};
  const fullName = firstNonEmpty(metadata.full_name, metadata.name);
  // One word, because it sits in a 44px-budget header next to eight nav items
  // and a truncated "Alexandra Constantinou-" reads worse than "Alexandra".
  if (fullName) return fullName.split(/\s+/)[0] ?? null;

  const email = firstNonEmpty(claims.email);
  if (!email) return null;

  // The local part, not the whole address: an account greeted as
  // "rickie@chattersnow.org" in a nav bar is a header that wraps, and the
  // address in full is already one line down in the menu.
  const localPart = email.split("@")[0];
  return localPart ? localPart : null;
}

function firstNonEmpty(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}
