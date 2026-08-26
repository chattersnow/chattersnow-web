import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { DisclosuresTable } from "./disclosures-table";
import type { Disclosure } from "./disclosures-actions";
import type { PersonListItem } from "../../people/actions";

const DISCLOSURE_SELECT =
  "id, disclosure_year, on_file_date, notes, external_link, body_text, person:people!person_id(id, name, email, phone)";

export default async function ConflictOfInterestPage() {
  const supabase = await createSupabaseServerClient();
  const permissions = await getCurrentUserPermissions(supabase);
  const canManage = hasPermission(permissions, "governance", "manage");

  const [{ data: disclosures }, { data: people }] = await Promise.all([
    supabase
      .from("conflict_of_interest_disclosures")
      .select(DISCLOSURE_SELECT)
      .order("disclosure_year", { ascending: false }),
    supabase
      .from("people")
      .select("id, name, email, phone, is_sponsor")
      .order("name", { ascending: true }),
  ]);

  return (
    <>
      <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
        Conflict of Interest
      </h1>

      <div className="mt-6">
        <DisclosuresTable
          disclosures={(disclosures ?? []) as unknown as Disclosure[]}
          people={(people ?? []) as PersonListItem[]}
          canManage={canManage}
        />
      </div>
    </>
  );
}
