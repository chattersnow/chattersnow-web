import type { MeetingRow } from "../meeting-badges";
import { MeetingStatusBadge, MeetingTypeBadge } from "../meeting-badges";
import { formatDatetimeLocal } from "../overview-tab";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { ReadOnlyField } from "@/components/ui/read-only-field";

export function MeetingDetailsCards({ meeting }: { meeting: MeetingRow }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="app-muted text-sm font-semibold">
            Meeting details
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <ReadOnlyField label="Date & time" htmlFor="meeting-date-view">
              {formatDatetimeLocal(meeting.meeting_date)}
            </ReadOnlyField>
            <ReadOnlyField label="Type" htmlFor="meeting-type-view">
              <MeetingTypeBadge type={meeting.meeting_type} />
            </ReadOnlyField>
            <ReadOnlyField label="Status" htmlFor="meeting-status-view">
              <MeetingStatusBadge status={meeting.status} />
            </ReadOnlyField>
            <ReadOnlyField label="Location" htmlFor="meeting-location-view">
              {meeting.location || "—"}
            </ReadOnlyField>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="app-muted text-sm font-semibold">
            People & notes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <ReadOnlyField
              label="Facilitator"
              htmlFor="meeting-facilitator-view"
            >
              {meeting.facilitator?.name || "—"}
            </ReadOnlyField>
            <ReadOnlyField label="Notes-taker" htmlFor="meeting-notetaker-view">
              {meeting.notetaker?.name || "—"}
            </ReadOnlyField>
            <ReadOnlyField label="Notes" htmlFor="meeting-notes-view">
              {meeting.notes || "—"}
            </ReadOnlyField>
          </FieldGroup>
        </CardContent>
      </Card>
    </div>
  );
}
