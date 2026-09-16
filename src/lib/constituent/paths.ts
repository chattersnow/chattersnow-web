/**
 * The signed-in area on the public host (#1160, #1161).
 *
 * A person sees their own history here -- events, volunteering, donations,
 * gear -- and, later, acts on it. It lives on the public site rather than in
 * the portal because it is not staff work: the portal requires a role, and
 * most of the people this is for have never had one.
 *
 * It is *not* a second account. The session is the portal's session, which is
 * why the auth cookie has to reach this host (`sessionCookieDomain`) and why
 * an administrator opening `/my` is already signed in and already linked to
 * their own `people` row.
 *
 * Unlike `/portal`, this prefix is never stripped or rewritten: `/my` is the
 * visible URL on every host that serves it.
 */
export const MY_PATH_PREFIX = "/my";

export function isMyPathname(pathname: string): boolean {
  return (
    pathname === MY_PATH_PREFIX || pathname.startsWith(`${MY_PATH_PREFIX}/`)
  );
}

export const MY_SIGN_IN_PATH = `${MY_PATH_PREFIX}/sign-in`;

/**
 * Sanitizes a `next` destination for the constituent sign-in.
 *
 * The twin of `safePortalDestination`, and narrow for the same reason: the
 * value comes off a query string and decides where a freshly authenticated
 * browser lands, so anything that is not plainly a path inside `/my` falls
 * back to `/my`. That rules out absolute and protocol-relative URLs, and also
 * rules out sending a constituent into `/portal`, which would bounce them
 * straight back out to the no-access screen.
 *
 * Lives here rather than beside the guard it serves because the sign-in form
 * is a client component: `guard.ts` reaches `next/headers` through the server
 * Supabase client, and importing one pure function from it pulled that whole
 * module into the browser bundle -- a build error rather than a runtime
 * surprise, but only once a page actually rendered.
 */
export function safeMyDestination(next: string | null | undefined): string {
  if (!next) return MY_PATH_PREFIX;
  if (
    !next.startsWith("/") ||
    next.startsWith("//") ||
    next.startsWith("/\\")
  ) {
    return MY_PATH_PREFIX;
  }
  if (next !== MY_PATH_PREFIX && !next.startsWith(`${MY_PATH_PREFIX}/`)) {
    return MY_PATH_PREFIX;
  }
  // The page that does the redirecting is not somewhere to be redirected to.
  if (next.startsWith(MY_SIGN_IN_PATH)) return MY_PATH_PREFIX;
  return next;
}
