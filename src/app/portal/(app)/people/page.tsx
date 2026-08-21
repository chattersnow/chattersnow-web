import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUserRoles, hasAnyRole } from "@/lib/auth/roles";
import { PeopleTable } from "./people-table";
import type { PersonRow } from "./people-shared";

export default async function PeoplePage() {
  const supabase = await createSupabaseServerClient();
  const roles = await getCurrentUserRoles(supabase);
  const canManage = hasAnyRole(roles, ["admin"]);

  const { data: people } = await supabase
    .from("people")
    .select("id, name, email, phone, notes, is_donor, is_sponsor, is_volunteer")
    .order("name", { ascending: true });

  return (
    <>
      <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
        People
      </h1>

      <div className="mt-6">
        <PeopleTable people={(people ?? []) as PersonRow[]} canManage={canManage} />
      </div>
    </>
  );
}
