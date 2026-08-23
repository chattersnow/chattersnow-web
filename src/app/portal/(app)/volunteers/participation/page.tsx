import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUserPermissions, hasPermission } from "@/lib/auth/permissions";
import { Card, CardContent } from "@/components/ui/card";
import { listVolunteerHoursAction } from "./actions";
import { LogHoursDialog } from "./log-hours-dialog";
import { HoursTable } from "./hours-table";

export default async function ParticipationPage() {
  const supabase = await createSupabaseServerClient();
  const permissions = await getCurrentUserPermissions(supabase);
  const canManage = hasPermission(permissions, "volunteers", "manage");
  const canLogOwn = hasPermission(permissions, "volunteer_hours_logging", "manage");

  const result = await listVolunteerHoursAction();
  const entries = "data" in result ? result.data : [];
  const totalHours = entries.reduce((sum, entry) => sum + Number(entry.hours), 0);

  return (
    <>
      <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
        Participation
      </h1>
      <p className="app-muted mt-2 max-w-2xl text-sm">
        Hours logged by volunteers, optionally tied to an event and role type. Volunteer records
        link back to entries in People.
      </p>

      <div className="mt-6 flex justify-end">
        {canManage || canLogOwn ? <LogHoursDialog /> : null}
      </div>

      <Card className="mt-6">
        <CardContent className="px-0">
          {"error" in result ? (
            <p className="app-muted px-4 py-6 text-sm">{result.error}</p>
          ) : entries.length === 0 ? (
            <p className="app-muted px-4 py-6 text-sm">No hours logged yet.</p>
          ) : (
            <>
              <p className="app-muted px-4 pt-4 text-sm">{totalHours} total hours logged</p>
              <HoursTable entries={entries} canManage={canManage} />
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}
