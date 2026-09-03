import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { GrantsTable } from "./grants-table";
import { NewGrantDialog } from "./new-grant-dialog";
import type { Grant } from "./grants-actions";
import type { PersonListItem } from "../../people/actions";

const GRANT_SELECT =
  "id, funder_name, amount, application_deadline, status, notes, owner:people!owner_person_id(id, name, preferred_name, email, phone)";

export const metadata: Metadata = {
  title: "Grants",
};

export default async function GrantsPage() {
  const supabase = await createSupabaseServerClient();
  const permissions = await getCurrentUserPermissions(supabase);
  const canManage = hasPermission(permissions, "governance", "manage");

  const [{ data: grants }, { data: people }] = await Promise.all([
    supabase
      .from("grants")
      .select(GRANT_SELECT)
      .order("application_deadline", { ascending: true }),
    supabase
      .from("people")
      .select(
        "id, name, preferred_name, email, phone, is_sponsor, auth_user_id",
      )
      .order("name", { ascending: true }),
  ]);

  const peopleOptions = (people ?? []) as PersonListItem[];

  return (
    <>
      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Grants
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>

      <div className="mt-6">
        <GrantsTable
          grants={(grants ?? []) as unknown as Grant[]}
          people={peopleOptions}
          canManage={canManage}
          newAction={
            canManage ? <NewGrantDialog people={peopleOptions} /> : undefined
          }
        />
      </div>
    </>
  );
}
