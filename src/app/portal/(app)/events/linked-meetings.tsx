"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  listEventMeetingsAction,
  type EventMeeting,
} from "../governance/meetings/actions";
import {
  MeetingStatusBadge,
  MeetingTypeBadge,
} from "../governance/meetings/meeting-badges";
import { ReadOnlyField } from "@/components/ui/read-only-field";
import { formatDateTime } from "@/lib/format";

/**
 * The governance meetings linked to this event (#1622). Fetched here rather
 * than with the event, and absent until there is one, so a tenant or reader
 * with no governance access never sees an empty field for it -- the select
 * policy already returns only the meetings this reader may see.
 */
export function LinkedMeetings({ eventId }: { eventId: string }) {
  const [meetings, setMeetings] = useState<EventMeeting[]>([]);

  useEffect(() => {
    let cancelled = false;
    listEventMeetingsAction(eventId).then((rows) => {
      if (!cancelled) setMeetings(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  if (meetings.length === 0) return null;

  return (
    <ReadOnlyField label="Meetings" htmlFor="details-meetings">
      <ul className="flex flex-col gap-1.5">
        {meetings.map((meeting) => (
          <li key={meeting.id} className="flex flex-wrap items-center gap-2">
            <Link
              href={`/portal/governance/meetings/${meeting.id}`}
              className="underline underline-offset-2"
            >
              {formatDateTime(meeting.meeting_date)}
            </Link>
            <MeetingTypeBadge type={meeting.meeting_type} />
            <MeetingStatusBadge status={meeting.status} />
          </li>
        ))}
      </ul>
    </ReadOnlyField>
  );
}
