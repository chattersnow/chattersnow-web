import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { resolveCurrentPerson } from "@/lib/auth/current-person";
import { EmptyState } from "@/components/portal/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { QueueClaimFilterField } from "@/components/portal/queue-claim-filter";
import {
  getQueueClaimContext,
  type QueueClaimContext,
} from "@/lib/portal/queue-claim-context";
import { CLAIM_FILTER_PARAM, parseClaimFilter } from "@/lib/queue-claims";
import {
  listPendingVolunteerHoursAction,
  listVolunteerHoursAction,
} from "./actions";
import { LogHoursDialog } from "./log-hours-dialog";
import { HoursTable } from "./hours-table";
import { PendingHours } from "./pending-hours";

export const metadata: Metadata = {
  title: "Volunteer Participation",
};

type ParticipationPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const selectClassName =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

const NO_CLAIM_CONTEXT: QueueClaimContext = { myPersonId: null, staff: [] };

export default async function ParticipationPage({
  searchParams,
}: ParticipationPageProps) {
  const supabase = await createSupabaseServerClient();
  const permissions = await getCurrentUserPermissions(supabase);
  const canManage = hasPermission(permissions, "volunteers", "manage");
  const canLogOwn = hasPermission(
    permissions,
    "volunteer_hours_logging",
    "manage",
  );
  const selfLogOnly = canLogOwn && !canManage;
  // The ops inbox links here with `claimed=none` when some self-logged hours
  // are already claimed (#1668).
  const claimFilter = parseClaimFilter(
    (await searchParams)[CLAIM_FILTER_PARAM],
  );
  const claimContext = canManage
    ? await getQueueClaimContext(supabase)
    : NO_CLAIM_CONTEXT;

  const [result, pending, selfPerson] = await Promise.all([
    listVolunteerHoursAction(),
    // Only for somebody who can decide. A volunteer with
    // volunteer_hours_logging:manage can log hours but not confirm anyone's,
    // so showing them a queue they cannot act on would be a list of other
    // people's shifts and nothing else.
    canManage
      ? listPendingVolunteerHoursAction(claimFilter, claimContext.myPersonId)
      : Promise.resolve({ data: [] as never[] }),
    selfLogOnly ? resolveCurrentPerson(supabase) : Promise.resolve(null),
  ]);
  const pendingEntries = "data" in pending ? pending.data : [];
  // A filter that matches nothing still shows the card, so the filter that
  // emptied it is there to change.
  const showPending =
    pendingEntries.length > 0 || (canManage && claimFilter.kind !== "all");
  const entries = "data" in result ? result.data : [];
  const totalHours = entries.reduce(
    (sum, entry) => sum + Number(entry.hours),
    0,
  );

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="w-fit">
          <h1 className="brand-display text-4xl font-semibold tracking-brand sm:text-5xl">
            Participation
          </h1>
          <div className="rainbow-accent mt-3 w-full" />
        </div>
      </div>

      {canManage || canLogOwn ? (
        <div className="rainbow-surface mt-6 flex flex-wrap items-center justify-end gap-3 rounded-xl border border-[var(--line)] p-4 shadow-md">
          <LogHoursDialog canManage={canManage} selfPerson={selfPerson} />
        </div>
      ) : null}

      {/* Hours volunteers logged for themselves, which are deliberately not in
          the ledger below until somebody confirms them (#1165). Above it,
          because it is the thing with a decision waiting on it; absent
          entirely when there is nothing waiting, so the page does not grow a
          permanent empty box. */}
      {showPending ? (
        <Card className="mt-6">
          <CardContent className="px-0">
            <div className="px-4 pt-4">
              <h2 className="brand-display text-lg font-semibold">
                Logged by volunteers
              </h2>
              <p className="app-muted mt-1 text-sm">
                Confirm these and they join the log below. Correct the number
                first if it is wrong.
              </p>
            </div>
            <form
              method="get"
              className="mt-3 flex flex-wrap items-end gap-3 px-4"
            >
              <QueueClaimFilterField
                filter={claimFilter}
                staff={claimContext.staff}
                selectClassName={selectClassName}
              />
              <Button type="submit" variant="secondary" size="sm">
                Apply
              </Button>
            </form>
            <div className="mt-3">
              {pendingEntries.length > 0 ? (
                <PendingHours
                  entries={pendingEntries}
                  canManage={canManage}
                  myPersonId={claimContext.myPersonId}
                  staff={claimContext.staff}
                />
              ) : (
                <EmptyState
                  title="No self-logged hours match this filter"
                  description="Try a different claimed-by filter."
                />
              )}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card className="mt-6">
        <CardContent className="px-0">
          {"error" in result ? (
            <p className="app-muted px-4 py-6 text-sm">{result.error}</p>
          ) : entries.length === 0 ? (
            <EmptyState
              title="No hours logged yet"
              description={
                canManage || canLogOwn
                  ? "Log the first entry with Log hours above."
                  : "Hours appear here once volunteers log them."
              }
            />
          ) : (
            <>
              <p className="app-muted px-4 pt-4 text-sm">
                {totalHours} total hours logged
              </p>
              <HoursTable entries={entries} canManage={canManage} />
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}
