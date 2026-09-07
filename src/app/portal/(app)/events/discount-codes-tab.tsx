"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import {
  assignDiscountCodeAction,
  deleteDiscountCodeAction,
  listDiscountCodesAction,
  markDiscountCodeSentAction,
  type DiscountCode,
} from "./discount-codes-actions";
import type { EventRegistrant } from "./registrants-actions";
import { useTabData, type TabData } from "@/hooks/use-tab-data";
import { useRegisterTabRefresh } from "@/hooks/use-tab-refresh";
import type { TabValue } from "./event-tabs-config";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PortalDataTable,
  withoutSorting,
  type PortalDataTableColumn,
} from "@/components/portal/data-table";
import { ConfirmDeleteButton } from "@/components/portal/confirm-delete-button";
import { TabLoadingSkeleton } from "@/components/portal/tab-loading-skeleton";
import {
  LIST_PREVIEW_ROWS,
  ListPreviewSheet,
} from "@/components/portal/list-preview-sheet";
import { formatInstantDate } from "@/lib/format";
import { EmptyState } from "@/components/portal/empty-state";

// Base UI's Select doesn't accept an empty-string item value, so "no
// registrant assigned" needs its own sentinel instead.
const UNASSIGNED = "__unassigned__";

export function DiscountCodesTab({
  eventId,
  mode,
  registrants: registrantsData,
  previewRows = LIST_PREVIEW_ROWS,
}: {
  eventId: string;
  mode: "view" | "edit";
  registrants: TabData<EventRegistrant[]>;
  /** Rows before the rest move behind "View all"; `null` disables the cap. */
  previewRows?: number | null;
}) {
  const {
    data: codes,
    loadError,
    refresh: refreshCodes,
  } = useTabData<DiscountCode[]>(
    () => listDiscountCodesAction(eventId),
    [eventId],
  );
  const registrants = registrantsData.data;
  const refreshRegistrants = registrantsData.refresh;
  const [actionError, setActionError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [isPending, startTransition] = useTransition();

  // Stable, so the column list below only rebuilds when something it renders
  // differently changes.
  const refreshAll = useCallback(() => {
    refreshCodes();
    refreshRegistrants();
  }, [refreshCodes, refreshRegistrants]);

  useRegisterTabRefresh<TabValue>("discount-codes", refreshAll);

  const handleAssign = useCallback(
    (codeId: string, registrationId: string) => {
      setActionError(null);
      startTransition(async () => {
        const result = await assignDiscountCodeAction(
          codeId,
          registrationId === UNASSIGNED ? null : registrationId,
        );
        if ("error" in result) {
          setActionError(result.error);
          return;
        }
        refreshAll();
      });
    },
    [refreshAll],
  );

  const handleMarkSent = useCallback(
    (codeId: string) => {
      setActionError(null);
      startTransition(async () => {
        const result = await markDiscountCodeSentAction(codeId);
        if ("error" in result) {
          setActionError(result.error);
          return;
        }
        refreshAll();
      });
    },
    [refreshAll],
  );

  const handleDelete = useCallback(
    (codeId: string) => {
      startTransition(async () => {
        await deleteDiscountCodeAction(codeId);
        refreshAll();
      });
    },
    [refreshAll],
  );

  const list = useMemo(() => codes ?? [], [codes]);

  const availableRegistrants = useMemo(() => {
    const assignedRegistrationIds = new Set(
      list
        .map((code) => code.registration_id)
        .filter((id): id is string => !!id),
    );
    return (registrants ?? []).filter(
      (registrant) => !assignedRegistrationIds.has(registrant.id),
    );
  }, [list, registrants]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((code) =>
      [
        code.code,
        code.description,
        code.source,
        code.registration?.name,
        code.registration?.email,
        code.sent_to_name,
        code.sent_to_email,
      ].some((field) => field?.toLowerCase().includes(needle)),
    );
  }, [list, query]);

  const columns = useMemo<PortalDataTableColumn<DiscountCode>[]>(
    () => [
      {
        key: "code",
        label: "Code",
        sortValue: (code) => code.code,
        cellClassName: "max-w-xs truncate font-medium",
        render: (code) => code.code,
      },
      {
        key: "description",
        label: "Description",
        sortValue: (code) => code.description,
        cellClassName: "max-w-xs truncate app-muted",
        render: (code) => code.description ?? "—",
      },
      {
        key: "source",
        label: "Source",
        sortValue: (code) => code.source,
        cellClassName: "app-muted",
        render: (code) => code.source ?? "—",
      },
      {
        key: "registration",
        label: "Assigned to",
        // Sorts on whoever the cell names, whether that came from the linked
        // registration or from the name the code was sent to by hand.
        sortValue: (code) => code.registration?.name ?? code.sent_to_name,
        render: (code) =>
          mode === "edit" && !code.sent_at ? (
            <Select
              value={code.registration_id ?? UNASSIGNED}
              onValueChange={(value) =>
                handleAssign(code.id, value ?? UNASSIGNED)
              }
              disabled={isPending}
            >
              <SelectTrigger
                className="w-full"
                aria-label={`Registrant assigned to discount code ${code.code}`}
              >
                <SelectValue placeholder="Unassigned">
                  {() =>
                    code.registration ? code.registration.name : "Unassigned"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                {code.registration && (
                  <SelectItem value={code.registration.id}>
                    {code.registration.name}
                  </SelectItem>
                )}
                {availableRegistrants.map((registrant) => (
                  <SelectItem key={registrant.id} value={registrant.id}>
                    {registrant.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : code.registration || code.sent_to_name ? (
            <span>
              {code.registration?.name ?? code.sent_to_name}
              <span className="app-muted block text-xs">
                {code.registration?.email ?? code.sent_to_email}
              </span>
            </span>
          ) : (
            <span className="app-muted">Unassigned</span>
          ),
      },
      {
        key: "assigned_at",
        label: "Assigned",
        sortValue: (code) => code.assigned_at,
        cellClassName: "app-muted whitespace-nowrap",
        render: (code) => formatInstantDate(code.assigned_at),
      },
      {
        key: "sent_at",
        label: "Sent",
        sortValue: (code) => code.sent_at,
        cellClassName: "whitespace-nowrap",
        render: (code) =>
          code.sent_at ? (
            <span className="app-muted">{formatInstantDate(code.sent_at)}</span>
          ) : mode === "edit" && code.registration_id ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={isPending}
              onClick={() => handleMarkSent(code.id)}
            >
              Mark as sent
            </Button>
          ) : (
            <span className="app-muted">—</span>
          ),
      },
      ...(mode === "edit"
        ? [
            {
              key: "actions",
              label: "Actions",
              srOnlyLabel: true,
              headClassName: "w-0",
              cellClassName: "text-right whitespace-nowrap",
              render: (code: DiscountCode) => (
                <ConfirmDeleteButton
                  label="Remove code"
                  title={`Remove discount code ${code.code}?`}
                  description="This deletes the code and unassigns it from any registrant it was issued to. It can't be undone."
                  confirmLabel="Remove"
                  pending={isPending}
                  onConfirm={() => handleDelete(code.id)}
                />
              ),
            } satisfies PortalDataTableColumn<DiscountCode>,
          ]
        : []),
    ],
    [
      mode,
      isPending,
      availableRegistrants,
      handleAssign,
      handleMarkSent,
      handleDelete,
    ],
  );

  // Only the copy that holds every row may claim to order them; see
  // `withoutSorting`.
  const previewColumns = useMemo(() => withoutSorting(columns), [columns]);

  const capped = previewRows === null ? list : list.slice(0, previewRows);
  const hasOverflow = previewRows !== null && list.length > previewRows;
  const previewIsWholeList = !hasOverflow;

  return (
    <div className="flex flex-col gap-4">
      {loadError && (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}
      {actionError && (
        <Alert variant="destructive">
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      )}

      {codes === undefined ? (
        <TabLoadingSkeleton />
      ) : list.length === 0 ? (
        <EmptyState
          title="No discount codes recorded for this event yet"
          description="Add the first ones with + Add codes above."
        />
      ) : (
        <>
          <PortalDataTable
            columns={previewIsWholeList ? columns : previewColumns}
            rows={capped}
            getRowKey={(code) => code.id}
            // listDiscountCodesAction returns them oldest first, which is the
            // order they were added in; no column carries that, so the table
            // opens on it rather than on a sort of its own.
            emptyMessage="No discount codes to show."
            // The tab is already inside its own card on the phase grid.
            shell="bare"
          />
          {hasOverflow && (
            <ListPreviewSheet
              title="Discount codes"
              description={`${list.length} codes`}
              triggerLabel={`View all ${list.length} discount codes`}
              searchPlaceholder="Search code, source, or registrant"
              searchLabel="Search discount codes"
              query={query}
              onQueryChange={setQuery}
              totalCount={list.length}
              filteredCount={filtered.length}
            >
              <PortalDataTable
                columns={columns}
                rows={filtered}
                getRowKey={(code) => code.id}
                emptyMessage="No discount codes match your search. Clear or loosen it to see more."
                // The sheet body is the scroller here and brings its own
                // surface, so the header pins to the top of that rather than
                // to the portal's header.
                shell="bare"
                stickyHeader="container"
              />
            </ListPreviewSheet>
          )}
        </>
      )}
    </div>
  );
}
