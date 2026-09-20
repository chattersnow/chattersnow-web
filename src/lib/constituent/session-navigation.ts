import type { useRouter } from "next/navigation";

type AppRouter = ReturnType<typeof useRouter>;

/**
 * Leave a page after this browser's session has changed (#1304).
 *
 * `router.replace()` on its own is not enough anywhere in the constituent
 * area, because the signed-in state is resolved on the server: the `(public)`
 * layout reads the account once per render (`constituentAccountNav()`) and
 * hands the header and footer the answer. `/my/sign-in` and `/my` share that
 * layout segment, so a client navigation between them reuses the layout's
 * already-rendered RSC payload -- and with it the account as it was before
 * the session existed. The page below says "Your account" while the header
 * above still offers "Sign in".
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
