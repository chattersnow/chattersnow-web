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
  STAFF_MESSAGE_KIND,
  type MessageActor,
  type RecordMessageRow,
} from "@/lib/outbound-messages";

/**
 * What has been said to the person this record is about, from the portal.
 *
 * #1203 kept this local to the gear request on the grounds that a list is
 * mostly its query and cannot be factored before a second caller exists.
 * #1204 is the second and third, so it moves here whole: the gear request's
 * detail card, the volunteer application sheet and the contact message sheet
 * all render this, and none of them has its own copy to drift.
 *
 * Two columns rather than #1203's three, and that is what adopting cost. The
 * two new callers are right-hand sheets a few hundred pixels wide, where a
 * date column, a subject column and a status column do not fit -- the same
 * reasoning that already put the sender under the subject rather than in a
 * fourth column (#1090). The time joins it there, so every caller shows the
 * same three facts and only the detail page has room to spare.
 *
 * The status comes off the message row rather than from a join on
 * notification_deliveries, which only an administration manager may read: the
 * manager of the module has to be able to see whether their own message went.
 */
export function RecordMessages({
  messages,
  actors,
  emptyMessage,
}: {
  messages: RecordMessageRow[];
  actors: MessageActor[];
  /** Said when nothing has been sent yet; each queue names its own recipient. */
  emptyMessage: string;
}) {
  const actorById = new Map(actors.map((actor) => [actor.user_id, actor]));
  const sender = (message: RecordMessageRow) =>
    message.sent_by ? actorById.get(message.sent_by) : undefined;

  return (
    <Table
      // Cells wrap at every width, not only below `sm` as the default does.
      // Two of the three callers are right-hand sheets a few hundred pixels
      // wide, where a subject that refuses to wrap widens the table past the
      // sheet and pushes the delivery badge out of sight. Badges carry their
      // own `whitespace-nowrap`, so this reaches the prose and leaves the
      // controls alone.
      className="[&_td]:whitespace-normal [&_td]:break-words"
    >
      <TableHeader>
        <TableRow>
          <TableHead>Message</TableHead>
          <TableHead>Delivery</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {messages.length === 0 ? (
          <TableRow>
            <TableCell colSpan={2} className="app-muted text-sm">
              {emptyMessage}
            </TableCell>
          </TableRow>
        ) : (
          messages.map((message) => (
            <TableRow key={message.id}>
              <TableCell className="font-medium">
                {message.subject}
                <span className="app-muted block text-xs font-normal">
                  {message.kind === STAFF_MESSAGE_KIND
                    ? `Sent by ${actorDisplayName(sender(message), "a staff member")}`
                    : `Receipt, resent by ${actorDisplayName(sender(message), "a staff member")}`}
                  {" · "}
                  <ViewerTime iso={message.created_at} fallbackZone="UTC" />
                </span>
              </TableCell>
              <TableCell>
                <StatusBadge tone={outboundMessageStatusTone(message.status)}>
                  {outboundMessageStatusLabel(message.status)}
                </StatusBadge>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
