import { publicRead, unwrap } from "@/lib/api/handler";

/**
 * What the lending library will accept on a request: whether the organization
 * ships at all, and if so how the requester can cover the postage (#1032). A
 * consumer building its own request form needs this before rendering one, the
 * same way the site's cart does.
 */
const route = publicRead(async ({ supabase }) => {
  const rows = unwrap(
    await supabase.from("public_gear_request_settings").select("slot, value"),
  );

  const settings: Record<string, unknown> = {};
  for (const row of rows ?? []) {
    if (row.slot) settings[row.slot] = row.value;
  }
  return { settings };
});

export const GET = route.GET;
export const OPTIONS = route.OPTIONS;
