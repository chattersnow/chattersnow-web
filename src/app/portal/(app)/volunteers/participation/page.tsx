import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { resolveCurrentPerson } from "@/lib/auth/current-person";
import { Card, CardContent } from "@/components/ui/card";
import { listVolunteerHoursAction } from "./actions";
import { LogHoursDialog } from "./log-hours-dialog";
import { HoursTable } from "./hours-table";

export default async function ParticipationPage() {
  const supabase = await createSupabaseServerClient();
  const permissions = await getCurrentUserPermissions(supabase);
  const canManage = hasPermission(permissions, "volunteers", "manage");
  const canLogOwn = hasPermission(
    permissions,
    "volunteer_hours_logging",
    "manage",
  );
  const selfLogOnly = canLogOwn && !canManage;

  const [result, selfPerson] = await Promise.all([
    listVolunteerHoursAction(),
    selfLogOnly ? resolveCurrentPerson(supabase) : Promise.resolve(null),
  ]);
  const entries = "data" in result ? result.data : [];
  const totalHours = entries.reduce(
    (sum, entry) => sum + Number(entry.hours),
    0,
  );

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="w-fit">
          <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
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

      <Card className="mt-6">
        <CardContent className="px-0">
          {"error" in result ? (
            <p className="app-muted px-4 py-6 text-sm">{result.error}</p>
          ) : entries.length === 0 ? (
            <p className="app-muted px-4 py-6 text-sm">No hours logged yet.</p>
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
