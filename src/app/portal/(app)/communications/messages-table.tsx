"use client";

import { useMemo, useState } from "react";
import {
  useStickyFilter,
  useStickyStatusFilter,
} from "./use-sticky-status-filter";
import { Card, CardContent } from "@/components/ui/card";
import { FiltersSheet } from "@/components/filters-sheet";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PortalDataTable,
  type PortalDataTableColumn,
} from "@/components/portal/data-table";
import { MessageDetailsSheet } from "./message-details-sheet";
import { ContactMessageStatusBadge } from "./message-badges";
import {
  CONTACT_MESSAGE_STATUSES,
  type ContactMessage,
  type ContactMessageStatus,
} from "./message-types";
import {
  NO_RECORD_MESSAGES,
  type RecordMessages,
} from "@/lib/outbound-messages";
import { contactTopicLabel } from "@/lib/contact-topics";
import { useLexicon } from "@/components/lexicon-context";
import { formatInstantDate, personDisplayName } from "@/lib/format";
import { EmptyState } from "@/components/portal/empty-state";
import {
  ClaimRowActions,
  ClaimedByCell,
} from "@/components/portal/queue-claims";
import type { ClaimStaffMember } from "@/lib/portal/queue-claim-context";
import {
  isResolvedStatus,
  matchesClaimFilter,
  parseClaimFilter,
} from "@/lib/queue-claims";

const FILTER_ALL = "all";
const NO_STAFF: ClaimStaffMember[] = [];

export function MessagesTable({
  messages,
  canManage,
  initialStatusFilter = null,
  initialClaimFilter = null,
  myPersonId = null,
  staff = NO_STAFF,
  linkedMessageId = null,
  recordMessages = NO_RECORD_MESSAGES,
  replyTo = null,
  orgEmailEnabled = false,
}: {
  messages: ContactMessage[];
  canManage: boolean;
  initialStatusFilter?: ContactMessageStatus | null;
  /**
   * The `?claimed=` the page was opened with (#1670), as `none`, `mine` or a
   * person id; null for no filter.
   */
  initialClaimFilter?: string | null;
  /** The caller's own person record, for "Mine" and Claim. */
  myPersonId?: string | null;
  /** Who a message can be assigned to or filtered by. */
  staff?: ClaimStaffMember[];
  /** The `?message=` a notification email (#742) linked with, if any. */
  linkedMessageId?: string | null;
  /**
   * Every reply sent about the messages in this list, keyed by id (#1204).
   * Defaulted, with the two settings beside it, so a caller that renders the
   * table for a reader who cannot reply -- and every test that predates the
   * replies -- says nothing about messaging at all.
   */
  recordMessages?: RecordMessages;
  replyTo?: string | null;
  orgEmailEnabled?: boolean;
}) {
  const [search, setSearch] = useState("");
  const {
    status: statusFilter,
    setStatus: setStatusFilter,
    isVisible,
  } = useStickyStatusFilter(messages, initialStatusFilter);
  // Sticky like status, and for the same reason: claiming a message from the
  // Unclaimed view (the ops inbox's link) would otherwise drop the row, and
  // its open sheet with it.
  const {
    value: claimFilter,
    setValue: setClaimFilter,
    isVisible: isClaimVisible,
  } = useStickyFilter(messages, initialClaimFilter, (message, value) =>
    matchesClaimFilter(
      message.claimant?.id ?? null,
      parseClaimFilter(value),
      myPersonId,
    ),
  );

  // Not memoized: isVisible closes over useStickyStatusFilter's internal
  // sticky-id state, which can change via a same-render state update (see
  // that hook) that a memo keyed on messages/search/statusFilter alone
  // wouldn't pick up. The table is small enough that filtering on every
  // render is cheap.
  const query = search.trim().toLowerCase();
  const visibleMessages = messages.filter((message) => {
    if (!isVisible(message) || !isClaimVisible(message)) return false;
    if (
      query &&
      !message.name.toLowerCase().includes(query) &&
      !message.email.toLowerCase().includes(query)
    )
      return false;
    return true;
  });

  const activeFilterCount = [
    search.trim() !== "",
    statusFilter !== null,
    claimFilter !== null,
  ].filter(Boolean).length;

  const claimOptions = [
    { value: FILTER_ALL, label: "All" },
    { value: "none", label: "Unclaimed" },
    { value: "mine", label: "Mine" },
    ...staff.map((person) => ({
      value: person.id,
      label: personDisplayName(person),
    })),
  ];
  // A person who has since lost portal access can still be the filter in a
  // shared link; keep them selectable rather than silently showing "All".
  if (
    claimFilter !== null &&
    !claimOptions.some((option) => option.value === claimFilter)
  ) {
    claimOptions.push({ value: claimFilter, label: "Someone else" });
  }

  const lexicon = useLexicon();
  const columns = useMemo<PortalDataTableColumn<ContactMessage>[]>(
    () => [
      {
        key: "name",
        label: "Name",
        sortValue: (message) => message.name,
        cellClassName: "font-medium",
        render: (message) => message.name,
      },
      {
        key: "email",
        label: "Email",
        hideBelow: "md",
        sortValue: (message) => message.email,
        cellClassName: "app-muted",
        render: (message) => message.email,
      },
      {
        key: "topic",
        label: "Topic",
        // On the label the cell shows, not the stored topic key.
        sortValue: (message) => contactTopicLabel(message.topic, lexicon),
        cellClassName: "app-muted",
        render: (message) => contactTopicLabel(message.topic, lexicon),
      },
      {
        key: "created_at",
        label: "Submitted",
        hideBelow: "sm",
        // The timestamp itself rather than the date the cell shows, so two
        // messages from the same day keep their real order.
        sortValue: (message) => message.created_at,
        cellClassName: "app-muted",
        render: (message) => formatInstantDate(message.created_at),
      },
      {
        key: "status",
        label: "Status",
        sortValue: (message) => message.status,
        render: (message) => (
          <ContactMessageStatusBadge status={message.status} />
        ),
      },
      {
        key: "claimed_by",
        label: "Claimed by",
        hideBelow: "sm",
        sortValue: (message) =>
          message.claimant ? personDisplayName(message.claimant, "") : null,
        render: (message) => <ClaimedByCell claimant={message.claimant} />,
      },
      {
        key: "actions",
        label: "Actions",
        srOnlyLabel: true,
        headClassName: "w-0",
        render: (message) => {
          // Both of the queue's claim permissions are communications:manage
          // today; set_queue_item_claim() checks them separately.
          const claim = {
            queue: "contact_messages" as const,
            itemId: message.id,
            itemLabel: `Message from ${message.name}`,
            claimant: message.claimant,
            myPersonId,
            canClaim: canManage,
            canAssign: canManage,
            resolved: isResolvedStatus("contact_messages", message.status),
            staff,
          };
          return (
            <span className="inline-flex items-center justify-end gap-1">
              <ClaimRowActions {...claim} />
              <MessageDetailsSheet
                message={message}
                canManage={canManage}
                claim={claim}
                messages={recordMessages.byRecord[message.id] ?? []}
                messageActors={recordMessages.actors}
                replyTo={replyTo}
                orgEmailEnabled={orgEmailEnabled}
                defaultOpen={message.id === linkedMessageId}
              />
            </span>
          );
        },
      },
    ],
    [
      canManage,
      myPersonId,
      staff,
      linkedMessageId,
      lexicon,
      recordMessages,
      replyTo,
      orgEmailEnabled,
    ],
  );

  if (messages.length === 0) {
    return (
      <Card>
        <CardContent className="px-0">
          <EmptyState
            title="No messages yet"
            description="Messages appear here when someone submits the public contact form."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rainbow-surface flex justify-end rounded-xl border border-[var(--line)] p-4 shadow-md">
        <FiltersSheet activeCount={activeFilterCount}>
          <div className="flex flex-col gap-1">
            <label
              htmlFor="messages-search"
              className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
            >
              Search
            </label>
            <Input
              id="messages-search"
              placeholder="Search name or email..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="app-muted text-xs font-semibold uppercase tracking-[0.1em]">
              Status
            </span>
            <Select
              value={statusFilter ?? FILTER_ALL}
              onValueChange={(value) =>
                setStatusFilter(
                  value === FILTER_ALL ? null : (value as ContactMessageStatus),
                )
              }
            >
              <SelectTrigger aria-label="Filter by status">
                <SelectValue placeholder="Status">
                  {(value: string) =>
                    value === FILTER_ALL ? "All statuses" : value
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FILTER_ALL}>All statuses</SelectItem>
                {CONTACT_MESSAGE_STATUSES.map((status) => (
                  <SelectItem
                    key={status}
                    value={status}
                    className="capitalize"
                  >
                    {status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <span className="app-muted text-xs font-semibold uppercase tracking-[0.1em]">
              Claimed by
            </span>
            <Select
              value={claimFilter ?? FILTER_ALL}
              items={claimOptions}
              onValueChange={(value) =>
                setClaimFilter(!value || value === FILTER_ALL ? null : value)
              }
            >
              <SelectTrigger aria-label="Filter by who claimed it">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {claimOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </FiltersSheet>
      </div>

      <PortalDataTable
        columns={columns}
        rows={visibleMessages}
        getRowKey={(message) => message.id}
        // The query returns newest first.
        defaultSort={{ key: "created_at", dir: "desc" }}
        emptyMessage="No messages match your filters."
      />
    </div>
  );
}
