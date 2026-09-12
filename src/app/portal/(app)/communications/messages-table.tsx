"use client";

import { useMemo, useState } from "react";
import { useStickyStatusFilter } from "./use-sticky-status-filter";
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
import { contactTopicLabel } from "@/lib/contact-topics";
import { useLexicon } from "@/components/lexicon-context";
import { formatInstantDate } from "@/lib/format";
import { EmptyState } from "@/components/portal/empty-state";

const FILTER_ALL = "all";

export function MessagesTable({
  messages,
  canManage,
  initialStatusFilter = null,
  linkedMessageId = null,
}: {
  messages: ContactMessage[];
  canManage: boolean;
  initialStatusFilter?: ContactMessageStatus | null;
  /** The `?message=` a notification email (#742) linked with, if any. */
  linkedMessageId?: string | null;
}) {
  const [search, setSearch] = useState("");
  const {
    status: statusFilter,
    setStatus: setStatusFilter,
    isVisible,
  } = useStickyStatusFilter(messages, initialStatusFilter);

  // Not memoized: isVisible closes over useStickyStatusFilter's internal
  // sticky-id state, which can change via a same-render state update (see
  // that hook) that a memo keyed on messages/search/statusFilter alone
  // wouldn't pick up. The table is small enough that filtering on every
  // render is cheap.
  const query = search.trim().toLowerCase();
  const visibleMessages = messages.filter((message) => {
    if (!isVisible(message)) return false;
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
  ].filter(Boolean).length;

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
        key: "actions",
        label: "Actions",
        srOnlyLabel: true,
        headClassName: "w-0",
        render: (message) => (
          <MessageDetailsSheet
            message={message}
            canManage={canManage}
            defaultOpen={message.id === linkedMessageId}
          />
        ),
      },
    ],
    [canManage, linkedMessageId, lexicon],
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
