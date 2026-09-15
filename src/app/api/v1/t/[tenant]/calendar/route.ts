import { publicRead, unwrap } from "@/lib/api/handler";

/**
 * The community calendar: the tenant's public calendar items and its published
 * events in one list, plus the tenant's own names for the categories it tags
 * them with (#834 -- the category list is per tenant, not a fixed six).
 */
const route = publicRead(async ({ supabase }) => {
  const [items, categories] = await Promise.all([
    supabase
      .from("public_calendar_items")
      .select(
        "id, title, item_type, starts_at, ends_at, time_zone, summary, categories, public_url",
      )
      .order("starts_at", { ascending: true }),
    supabase
      .from("public_calendar_categories")
      .select("key, label")
      .order("sort_order", { ascending: true }),
  ]);

  return { items: unwrap(items) ?? [], categories: unwrap(categories) ?? [] };
});

export const GET = route.GET;
export const OPTIONS = route.OPTIONS;
