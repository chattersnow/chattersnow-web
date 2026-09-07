"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getClientIp } from "@/lib/get-client-ip";

/**
 * One-click sign-in to the public demo tenant (#604).
 *
 * The credentials are read here and nowhere else: `DEMO_EMAIL` and
 * `DEMO_PASSWORD` are server-only (no `NEXT_PUBLIC_` prefix), so they never
 * cross into the client tree and the login page can only ever learn whether
 * they are set. That is why this is a Server Action rather than the browser
 * client the ordinary sign-in form uses.
 *
 * Signing in on the server client works because a Server Action *can* write
 * cookies -- the `catch` around `setAll` in createSupabaseServerClient exists
 * for the Server Component render path, not this one.
 */
export async function demoSignInAction(): Promise<{ error: string }> {
  const email = process.env.DEMO_EMAIL;
  const password = process.env.DEMO_PASSWORD;
  if (!email || !password) {
    return { error: "The demo is not available right now." };
  }

  // Ten clicks per IP per quarter hour. `check_rate_limit` is deliberately
  // ungranted to `authenticated` (20260826170000) -- it is only ever called
  // from inside other SECURITY DEFINER functions -- but `service_role` holds
  // execute on everything, so the admin client reaches it with no migration.
  const admin = createSupabaseAdminClient();
  const ip = await getClientIp();
  const { data: allowed, error: limitError } = await admin.rpc(
    "check_rate_limit",
    {
      p_route: "demo_signin",
      p_ip_address: ip,
      p_max_attempts: 10,
      p_window: "15 minutes",
    },
  );
  if (!limitError && allowed === false) {
    return { error: "Too many demo sign-ins from here. Try again shortly." };
  }

  const supabase = await createSupabaseServerClient();
  const first = await supabase.auth.signInWithPassword({ email, password });

  if (first.error) {
    // A visitor holds admin in the demo tenant, and /portal/set-password talks
    // straight to GoTrue from the browser -- so a visitor can change the demo
    // account's password and there is no server-side gate that would stop
    // them. Re-asserting it here means the next visitor's click repairs it,
    // rather than the demo being dead until the nightly reset runs.
    const users = await admin.auth.admin.listUsers({ perPage: 1000 });
    const demoUser = users.data?.users.find(
      (user) => user.email?.toLowerCase() === email.toLowerCase(),
    );
    if (!demoUser) {
      return { error: "The demo is not available right now." };
    }
    const reset = await admin.auth.admin.updateUserById(demoUser.id, {
      password,
    });
    if (reset.error) {
      return { error: "The demo is not available right now." };
    }
    const retry = await supabase.auth.signInWithPassword({ email, password });
    if (retry.error) {
      return { error: "The demo is not available right now." };
    }
  }

  redirect("/portal/home");
}
