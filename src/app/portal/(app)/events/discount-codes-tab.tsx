"use client";

import { useState, useTransition } from "react";
import {
  assignDiscountCodeAction,
  deleteDiscountCodeAction,
  listDiscountCodesAction,
  markDiscountCodeSentAction,
  type DiscountCode,
} from "./discount-codes-actions";
import {
  listEventRegistrantsAction,
  type EventRegistrant,
} from "./registrants-actions";
import { useTabData } from "@/hooks/use-tab-data";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmDeleteButton } from "@/components/portal/confirm-delete-button";
import { TabLoadingSkeleton } from "@/components/portal/tab-loading-skeleton";
import { formatInstantDate } from "@/lib/format";
import { EmptyState } from "@/components/portal/empty-state";

// Base UI's Select doesn't accept an empty-string item value, so "no
// registrant assigned" needs its own sentinel instead.
const UNASSIGNED = "__unassigned__";

export function DiscountCodesTab({
  eventId,
  active,
  mode,
}: {
  eventId: string;
  active: boolean;
  mode: "view" | "edit";
}) {
  const {
    data: codes,
    loadError,
    refresh: refreshCodes,
  } = useTabData<DiscountCode[]>(
    () => listDiscountCodesAction(eventId),
    active,
    [eventId],
  );
  const { data: registrants, refresh: refreshRegistrants } = useTabData<
    EventRegistrant[]
  >(() => listEventRegistrantsAction(eventId), active, [eventId]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function refreshAll() {
    refreshCodes();
    refreshRegistrants();
  }

  useRegisterTabRefresh<TabValue>("discount-codes", refreshAll);

  function handleAssign(codeId: string, registrationId: string) {
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
  }

  function handleMarkSent(codeId: string) {
    setActionError(null);
    startTransition(async () => {
      const result = await markDiscountCodeSentAction(codeId);
      if ("error" in result) {
        setActionError(result.error);
        return;
      }
      refreshAll();
    });
  }

  function handleDelete(codeId: string) {
    startTransition(async () => {
      await deleteDiscountCodeAction(codeId);
      refreshAll();
    });
  }

  const list = codes ?? [];
  const assignedRegistrationIds = new Set(
    list.map((code) => code.registration_id).filter((id): id is string => !!id),
  );
  const availableRegistrants = (registrants ?? []).filter(
    (registrant) => !assignedRegistrationIds.has(registrant.id),
  );

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
        <p className="app-muted text-sm">
          No discount codes recorded for this event yet.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Assigned to</TableHead>
              <TableHead>Assigned</TableHead>
              <TableHead>Sent</TableHead>
              {mode === "edit" && <TableHead className="w-px" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((code) => (
              <TableRow key={code.id}>
                <TableCell
                  className="max-w-xs truncate font-medium"
                  title={code.code}
                >
                  {code.code}
                </TableCell>
                <TableCell
                  className="max-w-xs truncate app-muted"
                  title={code.description ?? undefined}
                >
                  {code.description ?? "—"}
                </TableCell>
                <TableCell className="app-muted">
                  {code.source ?? "—"}
                </TableCell>
                <TableCell>
                  {mode === "edit" && !code.sent_at ? (
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
                            code.registration
                              ? code.registration.name
                              : "Unassigned"
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
                  )}
                </TableCell>
                <TableCell className="app-muted whitespace-nowrap">
                  {formatInstantDate(code.assigned_at)}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {code.sent_at ? (
                    <span className="app-muted">
                      {formatInstantDate(code.sent_at)}
                    </span>
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
                  )}
                </TableCell>
                {mode === "edit" && (
                  <TableCell className="text-right whitespace-nowrap">
                    <ConfirmDeleteButton
                      label="Remove code"
                      title={`Remove discount code ${code.code}?`}
                      description="This deletes the code and unassigns it from any registrant it was issued to. It can't be undone."
                      confirmLabel="Remove"
                      pending={isPending}
                      onConfirm={() => handleDelete(code.id)}
                    />
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
