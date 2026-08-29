import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { resolveCurrentPerson } from "@/lib/auth/current-person";
import { Card, CardContent } from "@/components/ui/card";
import { HowToSection, HowToSheet } from "@/components/how-to-sheet";
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
      <div className="rainbow-accent w-16" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Participation
        </h1>
        <HowToSheet title="How hours logging works">
          <HowToSection heading="Steps">
            <ol className="list-decimal space-y-2 pl-4">
              <li>
                <strong className="text-foreground">
                  Hours are logged directly
                </strong>{" "}
                — there&apos;s no approval step.
              </li>
              <li>
                <strong className="text-foreground">
                  Event and role type are optional
                </strong>{" "}
                — tie an entry to an event and a role type when it&apos;s
                relevant, or leave them blank for general hours.
              </li>
            </ol>
          </HowToSection>
          <HowToSection heading="Who can do this">
            <p>
              A volunteer with logging access can log their own hours; anyone
              with manage access (
              <strong className="text-foreground">admin</strong>) can log hours
              for another volunteer too.{" "}
              <strong className="text-foreground">event_coordinator</strong> can
              view all entries but can&apos;t log on someone else&apos;s behalf.
            </p>
          </HowToSection>
          <HowToSection heading="What happens downstream">
            <ul className="list-disc space-y-2 pl-4">
              <li>
                Logged hours roll up into the total shown below and link back to
                the volunteer&apos;s record in People.
              </li>
              <li>
                They feed the Impact Tracking rollups (e.g. &quot;290 volunteer
                hours&quot; in a season report) once the entry is tied to a
                program&apos;s event.
              </li>
            </ul>
          </HowToSection>
          <HowToSection heading="Common mistakes">
            <ul className="list-disc space-y-2 pl-4">
              <li>
                Logging hours against the wrong event is easy to miss since
                there&apos;s no approval step to catch it later.
              </li>
              <li>
                Trying to log hours for another volunteer without manage access
                — the entry is rejected, since logging access only covers your
                own hours.
              </li>
            </ul>
          </HowToSection>
        </HowToSheet>
      </div>

      <div className="mt-6 flex justify-end">
        {canManage || canLogOwn ? (
          <LogHoursDialog canManage={canManage} selfPerson={selfPerson} />
        ) : null}
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
