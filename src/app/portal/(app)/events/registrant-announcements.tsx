"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/portal/status-badge";
import { ViewerTime } from "@/components/viewer-time";
import { actorDisplayName } from "@/lib/format";
import type { MessageActor } from "@/lib/outbound-messages";
import type { AnnouncementBatch } from "@/lib/event-announcements";

/**
 * What has gone out to the whole registrant list, one line per announcement
 * (#1317).
 *
 * The question this answers is the second organizer's: did the road-closure
 * notice go, and to how many people? A registrant's own sheet already shows
 * the copy they received, but nothing there says it was one of thirty-seven --
 * and an announcement whose outcome can only be read one registrant at a time
 * is an announcement nobody checks.
 *
 * The counts come from the rows themselves rather than a stored tally, so they
 * are whatever actually happened: a batch still sending shows the copies
 * written so far and grows on the next load. Failures are shown beside the
 * successes rather than folded into a single status, because "went to 35 of
 * 37" is a thing somebody has to act on and "failed" is not what happened.
 */
export function RegistrantAnnouncements({
  batches,
  actors,
}: {
  batches: AnnouncementBatch[];
  actors: MessageActor[];
}) {
  const actorById = new Map(actors.map((actor) => [actor.user_id, actor]));

  return (
    <Table className="[&_td]:break-words [&_td]:whitespace-normal">
      <TableHeader>
        <TableRow>
          <TableHead>Announcement</TableHead>
          <TableHead>Delivery</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {batches.length === 0 ? (
          <TableRow>
            <TableCell colSpan={2} className="app-muted text-sm">
              No announcements have gone out to this event&apos;s registrants.
            </TableCell>
          </TableRow>
        ) : (
          batches.map((batch) => (
            <TableRow key={batch.batchId}>
              <TableCell className="font-medium">
                {batch.subject}
                <span className="app-muted block text-xs font-normal">
                  {`Sent by ${actorDisplayName(
                    batch.sentBy ? actorById.get(batch.sentBy) : undefined,
                    "a staff member",
                  )}`}
                  {" · "}
                  <ViewerTime iso={batch.sentAt} fallbackZone="UTC" />
                </span>
              </TableCell>
              <TableCell className="whitespace-nowrap">
                <StatusBadge tone={batch.failed > 0 ? "danger" : "success"}>
                  {batch.failed > 0
                    ? `${batch.sent} sent, ${batch.failed} failed`
                    : `${batch.sent} sent`}
                </StatusBadge>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
