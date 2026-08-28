import { createClient } from "@supabase/supabase-js";

export async function generateRecoveryLink(email: string): Promise<string> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000";

  if (!supabaseUrl || !secretKey) {
    throw new Error(
      "generateRecoveryLink requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY to be set.",
    );
  }

  const admin = createClient(supabaseUrl, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

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
