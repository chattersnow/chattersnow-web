import { publicRead, unwrap } from "@/lib/api/handler";

/** The roles this organization is publicly recruiting for. */
const route = publicRead(async ({ supabase }) => ({
  roles:
    unwrap(
      await supabase
        .from("public_volunteer_role_types")
        .select("id, name, description")
        .order("name", { ascending: true }),
    ) ?? [],
}));

export const GET = route.GET;
export const OPTIONS = route.OPTIONS;
