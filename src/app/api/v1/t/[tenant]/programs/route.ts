import { publicRead, unwrap } from "@/lib/api/handler";

/** The organization's programs, in the order it arranged them. */
const route = publicRead(async ({ supabase }) => ({
  programs:
    unwrap(
      await supabase
        .from("public_programs")
        .select("id, name, description, emoji, pillar, sort_order")
        .order("sort_order", { ascending: true }),
    ) ?? [],
}));

export const GET = route.GET;
export const OPTIONS = route.OPTIONS;
