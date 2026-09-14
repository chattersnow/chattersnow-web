import { publicRead, unwrap } from "@/lib/api/handler";

/**
 * The sponsor wall: organizations this tenant credits, whether through an
 * event or by hand (#1024). `name` can be null -- `people.name` is only
 * required of a donor who is not anonymous -- so a consumer rendering a wall
 * needs a fallback of its own.
 */
const route = publicRead(async ({ supabase }) => ({
  sponsors:
    unwrap(
      await supabase
        .from("public_sponsor_wall")
        .select("sponsor_id, name, logo_url, website"),
    ) ?? [],
}));

export const GET = route.GET;
export const OPTIONS = route.OPTIONS;
