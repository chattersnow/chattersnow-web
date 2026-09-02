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
  type ProgramImpactRollup,
  type RegistrationRow,
  type VolunteerHoursRow,
} from "./impact-rollup";

type RollupData = {
  event_ids: string[];
  events: EventRow[];
  impact_notes: ImpactNoteRow[];
  distributed_movements: DistributedMovementRow[];
  volunteer_hours: VolunteerHoursRow[];
  registrations: RegistrationRow[];
  checkin_counts: CheckinCountRow[];
  discount_codes: DiscountCodeRow[];
};

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const numberFormatter = new Intl.NumberFormat("en-US");

type ProgramImpactReportPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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
      });
    }
  }

  const selectClassName =
    "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

  const metricRows = rollup
    ? [
        { label: "Events", value: numberFormatter.format(rollup.eventCount) },
        {
          label: "Participants",
          value: numberFormatter.format(rollup.participants),
        },
        {
          label: "First-time participants",
          value: numberFormatter.format(rollup.firstTimeParticipants),
        },
        {
          label: "Beginner participants",
          value: numberFormatter.format(rollup.beginnerParticipants),
        },
        {
          label: "Participants receiving financial assistance",
          value: numberFormatter.format(rollup.assistedParticipants),
        },
        {
          label: "Equipment loans",
          value: numberFormatter.format(rollup.equipmentLoans),
        },
        {
          label: "Equipment distributed",
          value: numberFormatter.format(rollup.equipmentDistributed),
        },
        {
          label: "Volunteer hours",
          value: numberFormatter.format(rollup.volunteerHours),
        },
        {
          label: "Participant assistance ($)",
          value: currencyFormatter.format(rollup.participantAssistanceTotal),
        },
        {
          label: "Repeat participants",
          value: numberFormatter.format(rollup.repeatParticipants),
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
        Season/program rollup. Participants, first-time participants, and
        subsidized tickets are computed live from attendance/check-ins and
        discount codes; equipment distributed, volunteer hours, and repeat
        participants are computed live from inventory and volunteer records.
        Beginner participants, rental subsidies, equipment loans, and total
        assistance dollars are still staff-entered per event, across every event
        tagged to the selected program.
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
                  {numberFormatter.format(rollup.eventCount)}
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
                  {numberFormatter.format(rollup.participants)}
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
                  {numberFormatter.format(rollup.volunteerHours)}
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
                  {currencyFormatter.format(rollup.participantAssistanceTotal)}
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
