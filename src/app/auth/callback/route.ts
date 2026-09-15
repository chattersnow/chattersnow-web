import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MY_PATH_PREFIX } from "@/lib/constituent/paths";

export function resolveDestination(
  next: string | null,
  origin: string,
): string {
  if (!next) return "/portal/home";
  try {
    const url = new URL(next, origin);
    return url.origin === origin ? url.pathname + url.search : "/portal/home";
  } catch {
    return "/portal/home";
  }
}

/**
 * Where a failed sign-in is sent back to.
 *
 * This was `/portal/login?error=oauth_failed` unconditionally, which was right
 * while the portal was the only place anyone could sign in. Since #1161 the
 * same Google flow starts from `/my/sign-in` on the public host, and sending
 * that person to a portal login they have no role for would answer a failed
 * sign-in with a second dead end.
 *
 * Derived from the already-sanitized destination, so it inherits that
 * function's same-origin check rather than reading the raw query parameter
 * again -- a redirect target computed from unsanitized input is the bug this
 * whole pair exists to avoid.
 */
export function resolveFailureDestination(destination: string): string {
  return destination === MY_PATH_PREFIX ||
    destination.startsWith(`${MY_PATH_PREFIX}/`)
    ? `${MY_PATH_PREFIX}/sign-in?error=oauth_failed`
    : "/portal/login?error=oauth_failed";
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next");
  const providerError = requestUrl.searchParams.get("error");
  const destination = resolveDestination(next, requestUrl.origin);
  const loginWithError = new URL(
    resolveFailureDestination(destination),
    requestUrl.origin,
  );

  if (providerError) {
    return NextResponse.redirect(loginWithError);
  }

  if (!code) {
    return NextResponse.redirect(loginWithError);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(loginWithError);
  }

  // Claims any pending_role_grants staged for this email before first sign-in.
  // claim_pending_role_grants() only throws when a pending grant actually
  // existed for this email and materializing it failed, so failing closed
  // here can't affect a login with nothing staged.
  const { error: claimError } = await supabase.rpc("claim_pending_role_grants");
  if (claimError) {
    return NextResponse.redirect(loginWithError);
  }

  return NextResponse.redirect(new URL(destination, requestUrl.origin));
}
