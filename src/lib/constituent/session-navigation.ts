import type { useRouter } from "next/navigation";

type AppRouter = ReturnType<typeof useRouter>;

/**
 * Leave a page after this browser's session has changed (#1304).
 *
 * `router.replace()` on its own is not enough anywhere in the constituent
 * area, because the `/my` pages resolve the signed-in state on the server, and
 * a client navigation between them can reuse an already-rendered RSC payload
 * -- and with it the account as it was before the session existed. (The
 * public header and footer used to be the visible case, reading "Sign in"
 * above a page that said "Your account"; since #1467 they follow the session
 * in the browser instead.)
 *
 * `router.refresh()` discards that payload. Both directions need it, which is
 * why it lives here rather than in either caller: sign-out had it and sign-in
 * did not, and nothing held the two together.
 *
 * Not needed on paths that establish a session with a full page load -- the
 * OAuth callback (`/auth/callback`) redirects from the server, so the layout
 * is rendered fresh anyway.
 */
export function navigateAfterSessionChange(
  router: AppRouter,
  destination: string,
): void {
  router.replace(destination);
  router.refresh();
}
