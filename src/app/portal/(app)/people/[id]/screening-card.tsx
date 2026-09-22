import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getOrgTimeZone } from "@/lib/org-timezone";
import { todayInZone } from "@/lib/time";
import {
  loadPersonScreenings,
  type PersonScreeningRow,
} from "@/lib/portal/person-screenings";
import { HistoryCard } from "../aspects/history-card";
import { RecordScreeningDialog } from "./record-screening-dialog";
import { ScreeningList } from "./screening-list";

/**
 * The screening outcomes recorded against one person (#1360).
 *
 * Deliberately NOT an aspect. The registry in `../aspects/registry.ts` renders
 * for anyone holding `people:view` and its cards take no permissions prop,
 * which is the one thing this card must not do -- and folding it into
 * `volunteer-card.tsx` would put it in front of the same audience. It sits
 * beside the registry like `partnerships-card.tsx` instead.
 *
 * `canView` decides whether it renders at all, but it is not what keeps the
 * rows private: the select policy on `person_screenings` answers
 * `volunteer_screening:view` in the database, so a page that forgot this prop
 * would show an empty card rather than somebody's clearances. The prop is
 * here so the empty state is only shown to people it means something to --
 * "no outcome recorded" is information, and a viewer with no screening access
 * should not be told it.
 */
export async function PersonScreeningCard({
  personId,
  canView,
  canManage,
}: {
  personId: string;
  canView: boolean;
  canManage: boolean;
}) {
  if (!canView) return null;

  const supabase = await createSupabaseServerClient();
  const [{ byPerson }, { data: tierData }, zone] = await Promise.all([
    loadPersonScreenings(supabase, [personId]),
    // Only for the dialog's picker, so only for somebody who can open it.
    // Active levels only: a retired level is history, not a new decision.
    canManage
      ? supabase
          .from("volunteer_screening_tiers")
          .select("id, name")
          .eq("is_active", true)
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true })
      : Promise.resolve({ data: [] }),
    getOrgTimeZone(supabase),
  ]);

  const screenings: PersonScreeningRow[] = byPerson[personId] ?? [];
  const tiers = (tierData ?? []) as { id: string; name: string }[];
  const today = todayInZone(zone);

  // Unlike an aspect card there is no role flag upstream to gate this, so
  // without the early return every person in the directory would carry an
  // empty card. A manager keeps it even when empty: it holds the only control
  // that records the first outcome.
  if (screenings.length === 0 && !canManage) return null;

  return (
    <HistoryCard
      title="Screening"
      isEmpty={screenings.length === 0}
      emptyTitle="No screening outcome recorded"
      emptyDescription={
        tiers.length === 0
          ? "Name the levels this organization screens for under Volunteers → Screening levels before recording an outcome."
          : "Outcomes appear here once somebody with screening access records one."
      }
      actions={
        canManage ? (
          <RecordScreeningDialog
            personId={personId}
            tiers={tiers}
            today={today}
          />
        ) : undefined
      }
    >
      <ScreeningList
        personId={personId}
        screenings={screenings}
        today={today}
        canManage={canManage}
      />
    </HistoryCard>
  );
}
