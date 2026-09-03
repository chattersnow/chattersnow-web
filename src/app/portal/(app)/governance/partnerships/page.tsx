import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { PartnershipsTable } from "./partnerships-table";
import { NewPartnershipDialog } from "./new-partnership-dialog";
import type { PartnershipOpportunity } from "./partnerships-actions";
import type { PersonListItem } from "../../people/actions";

const PARTNERSHIP_SELECT =
  "id, stage, next_step_date, notes, organization:people!organization_person_id(id, name, preferred_name, email, phone), owner:people!owner_person_id(id, name, preferred_name, email, phone)";

export const metadata: Metadata = {
  title: "Partnerships",
};

export default async function PartnershipsPage() {
  const supabase = await createSupabaseServerClient();
  const permissions = await getCurrentUserPermissions(supabase);
  const canManage = hasPermission(permissions, "governance", "manage");

  const [{ data: opportunities }, { data: people }] = await Promise.all([
    supabase
      .from("partnership_opportunities")
      .select(PARTNERSHIP_SELECT)
      .order("next_step_date", { ascending: true, nullsFirst: false }),
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
          Partnerships
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>

      <div className="mt-6">
        <PartnershipsTable
          opportunities={
            (opportunities ?? []) as unknown as PartnershipOpportunity[]
          }
          people={peopleOptions}
          canManage={canManage}
          newAction={
            canManage ? (
              <NewPartnershipDialog people={peopleOptions} />
            ) : undefined
          }
        />
      </div>
    </>
  );
}
