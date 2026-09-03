import type { ReactNode } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatCalendarDate, formatInstantDate } from "@/lib/format";
import { HistoryCard, HistoryGroups, HistorySection } from "./history-card";

type EventRef = { name: string } | null;
type Signup = { id: string; role: string | null; event: EventRef };
type HoursEntry = {
  id: string;
  hours: number;
  logged_date: string;
  event: EventRef;
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
        .select("id, role, event:events(name)")
        .eq("person_id", personId),
      supabase
        .from("volunteer_hours")
        .select("id, hours, logged_date, event:events(name)")
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
          {signups.map((signup) => (
            <li key={signup.id}>
              {signup.event?.name ?? "—"}
              {signup.role ? ` · ${signup.role}` : ""}
            </li>
          ))}
        </HistorySection>

        <HistorySection
          title={`Hours logged (${totalHours})`}
          isEmpty={hours.length === 0}
        >
          {hours.map((entry) => (
            <li key={entry.id}>
              {formatCalendarDate(entry.logged_date)} · {entry.hours}h
              {entry.event?.name ? ` · ${entry.event.name}` : ""}
            </li>
          ))}
        </HistorySection>
      </HistoryGroups>
    </HistoryCard>
  );
}
