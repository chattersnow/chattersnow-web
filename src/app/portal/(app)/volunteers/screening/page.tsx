import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PortalBreadcrumbs } from "@/components/portal/breadcrumbs";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { EmptyState } from "@/components/portal/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { getOrgTimeZone } from "@/lib/org-timezone";
import { todayInZone } from "@/lib/time";
import { NewScreeningTierDialog } from "./new-screening-tier-dialog";
import { ScreeningTiersTable } from "./screening-tiers-table";
import type { ScreeningTierRow } from "./screening-tier-details-sheet";
import { RecentOutcomesTable, type OutcomeRow } from "./recent-outcomes-table";

export const metadata: Metadata = {
  title: "Screening levels · Volunteers",
};

export default async function VolunteerScreeningPage() {
  const supabase = await createSupabaseServerClient();
  const permissions = await getCurrentUserPermissions(supabase);
  const canManage = hasPermission(permissions, "volunteer_screening", "manage");

  const [{ data: tiers, error }, { data: outcomes }, zone] = await Promise.all([
    supabase
      .from("volunteer_screening_tiers")
      .select("id, name, description, sort_order, is_active")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("person_screenings")
      .select(
        "id, cleared_on, expires_on, person:people(id, name), tier:volunteer_screening_tiers(name)",
      )
      .order("cleared_on", { ascending: false })
      .limit(50),
    getOrgTimeZone(supabase),
  ]);

  const today = todayInZone(zone);
  const tierRows = (tiers ?? []) as ScreeningTierRow[];
  const outcomeRows = (outcomes ?? []) as unknown as OutcomeRow[];

  return (
    <>
      <PortalBreadcrumbs current="Screening levels" />
      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-brand sm:text-5xl">
          Screening levels
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>
      <p className="app-muted mt-2 max-w-2xl text-sm">
        The levels this organization screens volunteers for, in its own words,
        and the outcomes recorded against them. The portal records that somebody
        was cleared for a level and when — never the references, the interview,
        the check or anything a check returned.
      </p>

      {canManage ? (
        <div className="rainbow-surface mt-6 flex flex-wrap items-center justify-end gap-3 rounded-xl border border-[var(--line)] p-4 shadow-md">
          <NewScreeningTierDialog />
        </div>
      ) : null}

      {error || tierRows.length === 0 ? (
        <Card className="mt-6">
          <CardContent className="px-0">
            {error ? (
              <p className="app-muted px-4 py-6 text-sm">
                Could not load screening levels. Please try again.
              </p>
            ) : (
              <EmptyState
                title="No screening levels yet"
                description={
                  canManage
                    ? "Name the levels this organization screens for with New screening level above. Nothing is recorded against anyone until a level exists."
                    : "Levels appear here once someone with screening access names them."
                }
              />
            )}
          </CardContent>
        </Card>
      ) : (
        // PortalDataTable brings its own card.
        <div className="mt-6">
          <ScreeningTiersTable tiers={tierRows} canManage={canManage} />
        </div>
      )}

      <h2 className="mt-10 text-lg font-semibold">Recent outcomes</h2>
      <p className="app-muted mt-1 max-w-2xl text-sm">
        The 50 most recent, newest first. An outcome is recorded from a
        person&apos;s profile.
      </p>
      {outcomeRows.length === 0 ? (
        <Card className="mt-4">
          <CardContent className="px-0">
            <EmptyState
              title="No outcomes recorded"
              description="Outcomes appear here once somebody records one against a person."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="mt-4">
          <RecentOutcomesTable outcomes={outcomeRows} today={today} />
        </div>
      )}
    </>
  );
}
