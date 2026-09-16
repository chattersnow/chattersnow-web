import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  outboundMessageStatusLabel,
  outboundMessageStatusTone,
} from "@/lib/outbound-messages";
import { GearRequestMessageActions } from "./request-message-actions";

export type RequestMessageRow = {
  id: string;
  subject: string;
  kind: string;
  status: string;
  created_at: string;
  sent_by: string | null;
};

export type MessageActor = {
  user_id: string;
  email: string | null;
  full_name: string | null;
};

/**
 * What has been said to this requester from the portal (#1203).
 *
 * Deliberately local to the gear request for now. The composer beside it is
 * shared because its shape is the same for every record; this list is mostly
 * its query -- which columns, which empty-state sentence -- and that cannot be
 * factored for a second caller before the second caller exists. #1204 moves it
 * to `@/components/portal/record-messages` once there is one.
 *
 * The status comes off the message row rather than from a join on
 * notification_deliveries, which only an administration manager may read: an
 * inventory manager has to be able to see whether their own message went.
 */
export function RequestMessagesCard({
  requestId,
  messages,
  actors,
  recipientName,
  toEmail,
  orgName,
  replyTo,
  disabledReason,
}: {
  requestId: string;
  messages: RequestMessageRow[];
  actors: MessageActor[];
  recipientName: string;
  toEmail: string;
  orgName: string;
  replyTo: string | null;
  disabledReason?: string;
}) {
  const actorById = new Map(actors.map((actor) => [actor.user_id, actor]));
  const sender = (message: RequestMessageRow) =>
    message.sent_by ? actorById.get(message.sent_by) : undefined;

  return (
    <Card className="mt-6">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <CardTitle className="app-muted text-sm font-semibold">
          Messages
        </CardTitle>
        <GearRequestMessageActions
          requestId={requestId}
          recipientName={recipientName}
          toEmail={toEmail}
          orgName={orgName}
          replyTo={replyTo}
          disabledReason={disabledReason}
        />
      </CardHeader>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sent</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Delivery</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {messages.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="app-muted text-sm">
                  Nothing has been sent to this requester from the portal. The
                  confirmation they received when they asked is not listed here
                  — it was sent by the request itself.
                </TableCell>
              </TableRow>
            ) : (
              messages.map((message) => (
                <TableRow key={message.id}>
                  <TableCell className="whitespace-nowrap">
                    <ViewerTime iso={message.created_at} fallbackZone="UTC" />
                  </TableCell>
                  <TableCell className="font-medium">
                    {message.subject}
                    {/* Who sent it goes under the subject rather than in a
                        column of its own: four columns do not fit a phone
                        (#1090), and a column hidden below `sm` would put the
                        one fact a reader is chasing -- "who answered this?"
                        -- out of reach exactly where they are reading it. */}
                    <span className="app-muted block text-xs font-normal">
                      {message.kind === "staff_message"
                        ? `Sent by ${actorDisplayName(sender(message), "a staff member")}`
                        : `Receipt, resent by ${actorDisplayName(sender(message), "a staff member")}`}
                    </span>
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      tone={outboundMessageStatusTone(message.status)}
                    >
                      {outboundMessageStatusLabel(message.status)}
                    </StatusBadge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
