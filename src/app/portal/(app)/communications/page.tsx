import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { getOrgEmailEnabled } from "@/lib/notifications/settings";
import {
  CONTACT_MESSAGE_RECORD_TYPE,
  NO_RECORD_MESSAGES,
} from "@/lib/outbound-messages";
import { loadRecordMessages } from "@/lib/portal/record-messages";
import { getQueueClaimContext } from "@/lib/portal/queue-claim-context";
import {
  CLAIM_FILTER_PARAM,
  claimFilterValue,
  parseClaimFilter,
} from "@/lib/queue-claims";
import { MessagesTable } from "./messages-table";
import {
  CONTACT_MESSAGE_SELECT,
  CONTACT_MESSAGE_STATUSES,
  MESSAGE_PARAM,
  type ContactMessage,
  type ContactMessageStatus,
} from "./message-types";

type CommunicationsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function isContactMessageStatus(
  value: string | undefined,
): value is ContactMessageStatus {
  return (
    !!value && (CONTACT_MESSAGE_STATUSES as readonly string[]).includes(value)
  );
}

export const metadata: Metadata = {
  title: "Messages",
};

export default async function CommunicationsPage({
  searchParams,
}: CommunicationsPageProps) {
  const supabase = await createSupabaseServerClient();
  const [permissions, claimContext] = await Promise.all([
    getCurrentUserPermissions(supabase),
    getQueueClaimContext(supabase),
  ]);
  const canManage = hasPermission(permissions, "communications", "manage");

  const params = await searchParams;
  const statusParam = params.status;
  const initialStatusFilter = isContactMessageStatus(
    Array.isArray(statusParam) ? statusParam[0] : statusParam,
  )
    ? (statusParam as ContactMessageStatus)
    : null;
  // The ops inbox links here with `claimed=none` when some new messages are
  // already claimed (#1668). Applied client-side like the status filter, and
  // sticky the same way: claiming a message from the Unclaimed view must not
  // pull it out from under the reader (#1670).
  const claimFilter = parseClaimFilter(params[CLAIM_FILTER_PARAM]);
  const initialClaimFilter =
    claimFilter.kind === "all" ? null : claimFilterValue(claimFilter);

  // Which message a notification email (#742) linked at, if any. This list is
  // unpaginated and the deep link carries no status filter, so the row is
  // always among the ones rendered -- no separate fetch, unlike the volunteer
  // applications queue.
  const messageParam = params[MESSAGE_PARAM];
  const linkedMessageId =
    (Array.isArray(messageParam) ? messageParam[0] : messageParam) ?? null;

  const { data: messages, error } = await supabase
    .from("contact_messages")
    .select(CONTACT_MESSAGE_SELECT)
    .order("created_at", { ascending: false });

  const messageRows = (messages ?? []) as unknown as ContactMessage[];

  // What has been replied to each of these from the portal (#1204), in one
  // query rather than one per sheet. RLS answers with nothing at all without
  // communications:manage, so the check here only saves the round trips.
  const [recordMessages, orgEmailEnabled, orgMail] = await Promise.all([
    canManage
      ? loadRecordMessages(
          supabase,
          CONTACT_MESSAGE_RECORD_TYPE,
          messageRows.map((row) => row.id),
        )
      : NO_RECORD_MESSAGES,
    canManage ? getOrgEmailEnabled(supabase) : false,
    // The Reply-To the composer quotes, through the view that exists because
    // app_settings itself is closed to a communications manager.
    canManage
      ? supabase
          .from("org_notification_settings")
          .select("reply_to")
          .maybeSingle()
      : { data: null },
  ]);

  return (
    <>
      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-brand sm:text-5xl">
          Messages
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>
      <p className="app-muted mt-2 max-w-2xl text-sm">
        Contact-form submissions from the public site.
      </p>

      <div className="mt-6">
        {error ? (
          <p className="app-muted px-4 py-6 text-sm">
            Could not load messages. Please try again.
          </p>
        ) : (
          <MessagesTable
            messages={messageRows}
            canManage={canManage}
            initialStatusFilter={initialStatusFilter}
            initialClaimFilter={initialClaimFilter}
            myPersonId={claimContext.myPersonId}
            staff={claimContext.staff}
            linkedMessageId={linkedMessageId}
            recordMessages={recordMessages}
            replyTo={(orgMail.data?.reply_to as string | null) ?? null}
            orgEmailEnabled={orgEmailEnabled}
          />
        )}
      </div>
    </>
  );
}
