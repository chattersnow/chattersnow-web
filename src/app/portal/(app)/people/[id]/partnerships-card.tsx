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
 * Partnership involvement that is *not* the partner role, so it stays off the
 * aspect registry and renders alongside it.
 *
 * Two halves, neither of which makes someone a partner. Being the internal
 * owner is a work assignment on a staff or board member -- the opposite of
 * being the counterparty. And an organization still in the pipeline is a
 * prospect: is_partner is derived from a *won* opportunity (20260905020000),
 * so aspects/partner-card.tsx would never be shown for them and the history
 * would vanish. `showPipeline` is the detail page passing `!person.is_partner`
 * so exactly one of the two cards lists the org half, never both.
 *
 * Returns null when there is nothing to say. Unlike an aspect card there is no
 * role flag upstream to gate it, so without this every person in the directory
 * would carry an empty card.
 */
export async function PartnershipsCard({
  personId,
  showPipeline = false,
}: {
  personId: string;
  showPipeline?: boolean;
}) {
  const supabase = await createSupabaseServerClient();
  const [{ data: orgData }, { data: ownerData }] = await Promise.all([
    showPipeline
      ? supabase
          .from("partnership_opportunities")
          .select("id, stage, next_step_date")
          .eq("organization_person_id", personId)
      : Promise.resolve({ data: [] }),
    supabase
      .from("partnership_opportunities")
      .select("id, stage, organization:people!organization_person_id(name)")
      .eq("owner_person_id", personId),
  ]);

  const asOrg = (orgData ?? []) as unknown as AsOrg[];
  const asOwner = (ownerData ?? []) as unknown as AsOwner[];

  if (asOrg.length === 0 && asOwner.length === 0) return null;

  return (
    <HistoryCard
      title="Partnership involvement"
      isEmpty={false}
      emptyTitle="No partnership involvement"
      emptyDescription="Opportunities appear here once this record is named as the partner or owner from Governance › Partnerships."
    >
      <HistoryGroups>
        <HistorySection
          title="In the partnership pipeline"
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
