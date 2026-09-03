import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatCalendarDate } from "@/lib/format";
import {
  HistoryCard,
  HistoryGroups,
  HistorySection,
} from "../aspects/history-card";

type AsOrg = { id: string; stage: string; next_step_date: string | null };
type AsOwner = {
  id: string;
  stage: string;
  organization: { name: string | null } | null;
};

/**
 * Not an aspect: a partnership is a relationship between an organization and
 * an internal owner, not one of the person's roles. It shares the history
 * shell without joining the registry.
 */
export async function PartnershipsCard({ personId }: { personId: string }) {
  const supabase = await createSupabaseServerClient();
  const [{ data: orgData }, { data: ownerData }] = await Promise.all([
    supabase
      .from("partnership_opportunities")
      .select("id, stage, next_step_date")
      .eq("organization_person_id", personId),
    supabase
      .from("partnership_opportunities")
      .select("id, stage, organization:people!organization_person_id(name)")
      .eq("owner_person_id", personId),
  ]);

  const asOrg = (orgData ?? []) as unknown as AsOrg[];
  const asOwner = (ownerData ?? []) as unknown as AsOwner[];

  return (
    <HistoryCard
      title="Partnerships"
      isEmpty={asOrg.length === 0 && asOwner.length === 0}
      emptyTitle="No partnership involvement"
      emptyDescription="Opportunities appear here once this record is named as the partner or owner from Governance › Partnerships."
    >
      <HistoryGroups>
        <HistorySection
          title="As the partner organization"
          isEmpty={asOrg.length === 0}
        >
          {asOrg.map((opportunity) => (
            <li key={opportunity.id} className="capitalize">
              {opportunity.stage.replace("_", " ")}
              {opportunity.next_step_date
                ? ` · next step ${formatCalendarDate(opportunity.next_step_date)}`
                : ""}
            </li>
          ))}
        </HistorySection>

        <HistorySection
          title="As internal owner"
          isEmpty={asOwner.length === 0}
        >
          {asOwner.map((opportunity) => (
            <li key={opportunity.id}>
              {opportunity.organization?.name ?? "—"} ·{" "}
              <span className="capitalize">
                {opportunity.stage.replace("_", " ")}
              </span>
            </li>
          ))}
        </HistorySection>
      </HistoryGroups>
    </HistoryCard>
  );
}
