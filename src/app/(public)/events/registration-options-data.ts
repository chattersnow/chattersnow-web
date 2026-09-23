import type { SupabaseClient } from "@supabase/supabase-js";
import type { RegistrationOptionsQuestion } from "@/lib/registration-options";

/**
 * An event's registration question (#1407), or null for the events that ask
 * none -- almost all of them, which then render exactly as before.
 *
 * Read through `public_event_registration_options`, which says whether each
 * option is full and nothing about how many are left. A stale "open" here is
 * harmless: the RPC is what refuses a full option.
 */
export async function loadRegistrationOptions(
  supabase: SupabaseClient,
  eventId: string,
): Promise<RegistrationOptionsQuestion | null> {
  const { data } = await supabase
    .from("public_event_registration_options")
    .select("id, label, prompt, is_full")
    .eq("event_id", eventId)
    .order("sort_order", { ascending: true });

  const rows = data ?? [];
  const prompt = rows[0]?.prompt;
  if (rows.length === 0 || !prompt) return null;

  return {
    prompt,
    options: rows.map((row) => ({
      id: row.id as string,
      label: row.label as string,
      isFull: row.is_full === true,
    })),
  };
}
