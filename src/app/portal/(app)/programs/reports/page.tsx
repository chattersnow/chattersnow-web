import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listProgramsAction } from "../actions";
import {
  computeProgramImpactRollup,
  type CheckinCountRow,
  type DiscountCodeRow,
  type DistributedMovementRow,
  type EventRow,
  type ImpactNoteRow,
  type PersonEventRow,
  type ProgramImpactRollup,
  type RegistrationRow,
  type VolunteerHoursRow,
} from "./impact-rollup";
import { formatCurrency, formatNumber } from "@/lib/format";

type RollupData = {
  event_ids: string[];
  events: EventRow[];
  impact_notes: ImpactNoteRow[];
  distributed_movements: DistributedMovementRow[];
  volunteer_hours: VolunteerHoursRow[];
  registrations: RegistrationRow[];
  checkin_counts: CheckinCountRow[];
  discount_codes: DiscountCodeRow[];
  event_volunteers: PersonEventRow[];
  volunteer_hour_people: PersonEventRow[];
  beginner_attendees: PersonEventRow[];
  profiled_attendees: PersonEventRow[];
};

type ProgramImpactReportPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = {
  title: "Impact Report",
};

export default async function ProgramImpactReportPage({
  searchParams,
}: ProgramImpactReportPageProps) {
  const supabase = await createSupabaseServerClient();
  const params = await searchParams;
  const raw = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const programId = raw("programId") ?? "";

  const programsResult = await listProgramsAction();
  const programs = "data" in programsResult ? programsResult.data : [];

  let rollup: ProgramImpactRollup | null = null;
  let loadError: string | null = null;

  if (programId) {
    // Intentionally no date-range param: `programs` has no date columns
    // (each season is its own programs row, per
    // 20260825020000_add_programs_reports_resource.sql), so the rollup
    // includes every event ever tied to this program_id.
    const { data, error } = await supabase.rpc(
      "get_program_impact_rollup_data",
      {
        p_program_id: programId,
      },
    );

    if (error) {
      loadError =
        "Could not load this program's impact rollup. Please try again.";
    } else {
      const result = (data ?? {}) as RollupData;
      const eventIds = result.event_ids ?? [];
      rollup = computeProgramImpactRollup({
        eventCount: eventIds.length,
        events: result.events ?? [],
        notes: result.impact_notes ?? [],
        distributedMovements: result.distributed_movements ?? [],
        volunteerHours: result.volunteer_hours ?? [],
        registrations: result.registrations ?? [],
        checkinCounts: result.checkin_counts ?? [],
        discountCodes: result.discount_codes ?? [],
        eventVolunteers: result.event_volunteers ?? [],
        volunteerHourPeople: result.volunteer_hour_people ?? [],
        beginnerAttendees: result.beginner_attendees ?? [],
        profiledAttendees: result.profiled_attendees ?? [],
      });
    }
  }

  const selectClassName =
    "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

  const metricRows = rollup
    ? [
        { label: "Events", value: formatNumber(rollup.eventCount) },
        {
          label: "Participants",
          value: formatNumber(rollup.participants),
        },
        {
          label: "First-time participants",
          value: formatNumber(rollup.firstTimeParticipants),
        },
        {
          label: "Beginner participants",
          value: `${formatNumber(rollup.beginnerParticipants)} of ${formatNumber(
            rollup.profiledAttendees,
          )} with a rider profile`,
        },
        {
          label: "Participants with a discount code or rental subsidy",
          value: formatNumber(rollup.assistedParticipants),
        },
        {
          label: "Equipment distributed",
          value: formatNumber(rollup.equipmentDistributed),
        },
        {
          label: "Volunteers on site",
          value: formatNumber(rollup.volunteerParticipants),
        },
        {
          label: "Volunteer hours",
          value: formatNumber(rollup.volunteerHours),
        },
        {
          label: "Participant assistance ($)",
          value: formatCurrency(rollup.participantAssistanceTotal),
        },
        {
          label: "Repeat participants",
          value: formatNumber(rollup.repeatParticipants),
        },
      ]
    : [];

  return (
    <>
      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Program Impact Report
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>
      <p className="app-muted mt-2 max-w-2xl text-sm">
        Season/program rollup across every event tagged to the selected program.
        Every figure here is computed live from attendance, check-ins, discount
        codes, rider profiles, inventory and volunteer records — only rental
        subsidies and assistance dollars are still staff-entered per event,
        because nothing in the system records them. Two caveats worth knowing
        when quoting these numbers: internally-granted scholarships and fee
        waivers aren&apos;t modelled anywhere, so assistance undercounts; and
        &ldquo;Volunteers on site&rdquo; counts each person once per event, so
        someone who volunteered three times counts three times.
      </p>

      <div className="rainbow-surface mt-6 flex flex-wrap items-end justify-end gap-3 rounded-xl border border-[var(--line)] p-4 shadow-md">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="programId"
              className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
            >
              Program
            </label>
            <select
              id="programId"
              name="programId"
              defaultValue={programId}
              className={selectClassName}
            >
              <option value="">Select a program…</option>
              {programs.map((program) => (
                <option key={program.id} value={program.id}>
                  {program.name}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" variant="secondary">
            View
          </Button>
        </form>
      </div>

      {!programId ? (
        <Card className="mt-6">
          <CardContent className="app-muted px-4 py-6 text-sm">
            Select a program above to view its impact rollup.
          </CardContent>
        </Card>
      ) : loadError ? (
        <Card className="mt-6">
          <CardContent className="app-muted px-4 py-6 text-sm">
            {loadError}
          </CardContent>
        </Card>
      ) : rollup && rollup.eventCount === 0 ? (
        <Card className="mt-6">
          <CardContent className="app-muted px-4 py-6 text-sm">
            This program has no events yet.
          </CardContent>
        </Card>
      ) : rollup ? (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader>
                <CardTitle className="app-muted text-sm font-semibold">
                  Events
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="brand-display text-4xl font-semibold tracking-[-0.04em]">
                  {formatNumber(rollup.eventCount)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="app-muted text-sm font-semibold">
                  Participants
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="brand-display text-4xl font-semibold tracking-[-0.04em]">
                  {formatNumber(rollup.participants)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="app-muted text-sm font-semibold">
                  Volunteer hours
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="brand-display text-4xl font-semibold tracking-[-0.04em]">
                  {formatNumber(rollup.volunteerHours)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="app-muted text-sm font-semibold">
                  Participant assistance
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="brand-display text-4xl font-semibold tracking-[-0.04em]">
                  {formatCurrency(rollup.participantAssistanceTotal)}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>All metrics</CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Metric</TableHead>
                    <TableHead>Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {metricRows.map((row) => (
                    <TableRow key={row.label}>
                      <TableCell>{row.label}</TableCell>
                      <TableCell>{row.value}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      ) : null}
    </>
  );
}
