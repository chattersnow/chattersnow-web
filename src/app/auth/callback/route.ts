import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next");
  const providerError = requestUrl.searchParams.get("error");
  const destination = next?.startsWith("/") ? next : "/portal/home";
  const loginWithError = new URL("/portal/login?error=oauth_failed", requestUrl.origin);

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

  return NextResponse.redirect(new URL(destination, requestUrl.origin));
}