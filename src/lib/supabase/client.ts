import { createBrowserClient } from "@supabase/ssr";
import type { Db } from "@/lib/supabase/types";

export function createSupabaseBrowserClient() {
  return createBrowserClient<Db>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
