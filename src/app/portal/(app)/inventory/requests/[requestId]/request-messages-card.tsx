import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RecordMessages } from "@/components/portal/record-messages";
import type { MessageActor, RecordMessageRow } from "@/lib/outbound-messages";
import { GearRequestMessageActions } from "./request-message-actions";

/**
 * What has been said to this requester from the portal (#1203).
 *
 * The list itself is `@/components/portal/record-messages` since #1204 gave it
 * a second and third caller; what stays here is the frame the detail page
 * wants -- a card, a heading, and the two things a manager can do about this
 * request's correspondence.
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
  messages: RecordMessageRow[];
  actors: MessageActor[];
  recipientName: string;
  toEmail: string;
  orgName: string;
  replyTo: string | null;
  disabledReason?: string;
}) {
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
        <RecordMessages
          messages={messages}
          actors={actors}
          emptyMessage="Nothing has been sent to this requester from the portal. The confirmation they received when they asked is not listed here — it was sent by the request itself."
        />
      </CardContent>
    </Card>
  );
}
