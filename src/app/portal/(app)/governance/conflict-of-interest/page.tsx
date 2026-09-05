import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { DisclosuresTable } from "./disclosures-table";
import { NewDisclosureDialog } from "./new-disclosure-dialog";
import type { Disclosure } from "./disclosures-actions";
import type { PersonListItem } from "../../people/actions";
import { fiscalYearForDate, getFiscalYearStartMonth } from "@/lib/fiscal-year";

const DISCLOSURE_SELECT =
  "id, disclosure_year, on_file_date, notes, external_link, body_text, person:people!person_id(id, name, preferred_name, email, phone)";

export const metadata: Metadata = {
  title: "Conflict of Interest",
};

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
      .select("id, name, preferred_name, email, phone, auth_user_id")
      .order("name", { ascending: true }),
  ]);

  const peopleOptions = (people ?? []) as PersonListItem[];

  // `disclosure_year` names the fiscal year the disclosure covers, so the new
  // disclosure form has to default to the current fiscal year -- which only the
  // server can work out, since the start month is a setting.
  const currentFiscalYear = fiscalYearForDate(
    new Date(),
    await getFiscalYearStartMonth(supabase),
  );

  return (
    <>
      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Conflict of Interest
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>

      <div className="mt-6">
        <DisclosuresTable
          disclosures={(disclosures ?? []) as unknown as Disclosure[]}
          people={peopleOptions}
          canManage={canManage}
          newAction={
            canManage ? (
              <NewDisclosureDialog
                people={peopleOptions}
                currentFiscalYear={currentFiscalYear}
              />
            ) : undefined
          }
        />
      </div>
    </>
  );
}
