import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { resolveSiteUrl } from "./site-url";

export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !secretKey) {
    throw new Error(
      "createAdminClient requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY to be set.",
    );
  }

  return createClient(supabaseUrl, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

export async function generateRecoveryLink(email: string): Promise<string> {
  // The same origin the suite runs against -- in a worktree that is a derived
  // port, not :3000 (#809) -- so the link lands on the server under test.
  const siteUrl = resolveSiteUrl(
    process.env,
    join(__dirname, "..", ".."),
  ).baseURL;
  const admin = createAdminClient();

  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: `${siteUrl}/auth/confirm` },
  });

  if (error || !data) {
    throw new Error(
      `Could not generate a recovery link for ${email}: ${error?.message}`,
    );
  }

  return (
    `${siteUrl}/auth/confirm?token_hash=${data.properties.hashed_token}` +
    `&type=recovery&next=/portal/set-password`
  );
}
