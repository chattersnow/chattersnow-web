import { publicRead, unwrap } from "@/lib/api/handler";

/** Who the organization publishes on its team page. */
const route = publicRead(async ({ supabase }) => ({
  team:
    unwrap(
      await supabase
        .from("public_team")
        .select("id, name, role, bio, photo_url, sort_order")
        .order("sort_order", { ascending: true }),
    ) ?? [],
}));

export const GET = route.GET;
export const OPTIONS = route.OPTIONS;
