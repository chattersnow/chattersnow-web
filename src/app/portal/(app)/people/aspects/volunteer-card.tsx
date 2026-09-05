import type { ReactNode } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatCalendarDate, formatInstantDate } from "@/lib/format";
import { signupRoleLabel, type ShiftRoleRef } from "@/lib/volunteer-roles";
import { HistoryCard, HistoryGroups, HistorySection } from "./history-card";

type EventRef = { id: string; name: string } | null;
type Signup = {
  id: string;
  role: string | null;
  role_type: { name: string } | null;
  shift_id: string | null;
  event: EventRef;
  shift: ShiftRoleRef | null;
};
type HoursEntry = {
  id: string;
  hours: number;
  logged_date: string;
  event_id: string | null;
  event: { name: string } | null;
  volunteer_role_type: { name: string } | null;
};
type Application = {
  id: string;
  status: string;
  role_interest: string | null;
  created_at: string;
};

/**
 * Applications, sign-ups, and logged hours are one card with a joint empty
 * state -- somebody with an application but no hours has still volunteered --
 * so the three queries stay together rather than becoming three aspects.
 */
export async function VolunteerCard({
  personId,
  actions,
}: {
  personId: string;
  actions?: ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const [{ data: signupData }, { data: hoursData }, { data: applicationData }] =
    await Promise.all([
      supabase
        .from("event_volunteers")
        .select(
          "id, role, shift_id, role_type:volunteer_role_types(name), event:events(id, name), shift:event_shifts(id, role_type:volunteer_role_types(name))",
        )
        .eq("person_id", personId),
      supabase
        .from("volunteer_hours")
        .select(
          "id, hours, logged_date, event_id, event:events(name), volunteer_role_type:volunteer_role_types(name)",
        )
        .eq("person_id", personId)
        .order("logged_date", { ascending: false }),
      supabase
        .from("volunteer_applications")
        .select("id, status, role_interest, created_at")
        .eq("person_id", personId)
        .order("created_at", { ascending: false }),
    ]);

  const signups = (signupData ?? []) as unknown as Signup[];
  const hours = (hoursData ?? []) as unknown as HoursEntry[];
  const applications = (applicationData ?? []) as unknown as Application[];
  const totalHours = hours.reduce((sum, entry) => sum + Number(entry.hours), 0);

  const signupRoles = new Map(
    signups.map((signup) => [signup.id, roleOf(signup)] as const),
  );

  /**
   * Hours logged from the event editor's Volunteers tab carry no role type
   * (its dialog has no role field), and every row backfilled by
   * 20260904010000 landed with a null one -- so fall back to what this person
   * signed up as for that event.
   */
  const roleByEvent = new Map<string, string>();
  for (const signup of signups) {
    const role = signupRoles.get(signup.id);
    if (signup.event && role) roleByEvent.set(signup.event.id, role);
  }

  return (
    <HistoryCard
      title="Volunteer activity"
      isEmpty={
        signups.length === 0 && hours.length === 0 && applications.length === 0
      }
      emptyTitle="No volunteer activity recorded"
      emptyDescription="Applications, event sign-ups, and logged hours appear here once this person volunteers."
      actions={actions}
    >
      <HistoryGroups>
        <HistorySection
          title="Applications"
          isEmpty={applications.length === 0}
        >
          {applications.map((application) => (
            <li key={application.id}>
              {formatInstantDate(application.created_at)} ·{" "}
              <span className="capitalize">{application.status}</span>
              {application.role_interest
                ? ` · ${application.role_interest}`
                : ""}
            </li>
          ))}
        </HistorySection>

        <HistorySection title="Event sign-ups" isEmpty={signups.length === 0}>
          {signups.map((signup) => {
            const role = signupRoles.get(signup.id);
            return (
              <li key={signup.id}>
                {signup.event?.name ?? "—"}
                {role ? ` · ${role}` : ""}
              </li>
            );
          })}
        </HistorySection>

        <HistorySection
          title={`Hours logged (${totalHours})`}
          isEmpty={hours.length === 0}
        >
          {hours.map((entry) => {
            const role =
              entry.volunteer_role_type?.name ??
              (entry.event_id ? roleByEvent.get(entry.event_id) : undefined);
            return (
              <li key={entry.id}>
                {formatCalendarDate(entry.logged_date)} · {entry.hours}h
                {role ? ` · ${role}` : ""}
                {entry.event?.name ? ` · ${entry.event.name}` : ""}
              </li>
            );
          })}
        </HistorySection>
      </HistoryGroups>
    </HistoryCard>
  );
}

/** A signup carries its own shift, so the shared rule gets a one-item list. */
function roleOf(signup: Signup) {
  return signupRoleLabel(signup, signup.shift ? [signup.shift] : []);
}
