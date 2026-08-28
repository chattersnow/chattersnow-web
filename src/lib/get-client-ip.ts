import "server-only";
import { headers } from "next/headers";

// Vercel sets x-forwarded-for reliably at the edge; the first entry is the
// original client. Used to pass a per-caller identity into the shared
// Supabase-backed rate limiter (see check_rate_limit in
// supabase/migrations/20260826130000_create_rate_limit_check.sql).
export async function getClientIp(): Promise<string | null> {
  const headerStore = await headers();
  const forwardedFor = headerStore.get("x-forwarded-for");
  const firstIp = forwardedFor?.split(",")[0]?.trim();
  return firstIp || null;
}
