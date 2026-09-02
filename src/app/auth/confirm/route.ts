import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type") as EmailOtpType | null;
  const next = requestUrl.searchParams.get("next");
  const destination = next?.startsWith("/") ? next : "/portal/set-password";
  const loginWithError = new URL(
    "/portal/login?error=invite_failed",
    requestUrl.origin,
  );

  if (!tokenHash || !type) {
    return NextResponse.redirect(loginWithError);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({
    type,
    token_hash: tokenHash,
  });

  if (error) {
    return NextResponse.redirect(loginWithError);
  }

  // Claims any pending_role_grants staged for this email, same as the OAuth
  // callback -- see the comment there for why failing closed here is safe.
  const { error: claimError } = await supabase.rpc("claim_pending_role_grants");
  if (claimError) {
    return NextResponse.redirect(loginWithError);
  }

  return NextResponse.redirect(new URL(destination, requestUrl.origin));
}
