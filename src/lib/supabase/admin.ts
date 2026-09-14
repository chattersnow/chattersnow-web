import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Db } from "@/lib/supabase/types";

export function createSupabaseAdminClient() {
  return createClient<Db>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    },
  );
}
