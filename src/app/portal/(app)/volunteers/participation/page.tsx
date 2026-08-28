import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { Card, CardContent } from "@/components/ui/card";
import { WorkflowInfoCard } from "@/components/workflow-info-card";
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

  const result = await listVolunteerHoursAction();
  const entries = "data" in result ? result.data : [];
  const totalHours = entries.reduce(
    (sum, entry) => sum + Number(entry.hours),
    0,
  );

  return (
    <>
      <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
        Participation
      </h1>
      <div className="mt-6">
        <WorkflowInfoCard title="How hours logging works">
          <ol className="list-decimal space-y-2 pl-4">
            <li>
              <strong className="text-foreground">
                Hours are logged directly
              </strong>{" "}
              — there&apos;s no approval step. A volunteer with logging access
              can log their own hours; anyone with manage access can log hours
              for another volunteer too.
            </li>
            <li>
              <strong className="text-foreground">
                Event and role type are optional
              </strong>{" "}
              — tie an entry to an event and a role type when it&apos;s
              relevant, or leave them blank for general hours.
            </li>
          </ol>
          <p className="mt-3">
            Logged hours roll up into the total shown below and link back to the
            volunteer&apos;s record in People.
          </p>
        </WorkflowInfoCard>
      </div>

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
