"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { ConfirmDeleteButton } from "@/components/portal/confirm-delete-button";
import { EmptyState } from "@/components/portal/empty-state";
import { PortalFormPopup } from "@/components/portal/portal-form-surface";
import {
  PortalDataTable,
  type PortalDataTableColumn,
} from "@/components/portal/data-table";
import { TabLoadingSkeleton } from "@/components/portal/tab-loading-skeleton";
import { runAction } from "@/components/portal/action-toast";
import { ViewerTime } from "@/components/viewer-time";
import { useTabData } from "@/hooks/use-tab-data";
import { useRegisterTabRefresh } from "@/hooks/use-tab-refresh";
import type { TabValue } from "./event-tabs-config";
import {
  getEventAccessAction,
  grantEventAccessAction,
  listEventAccessCandidatesAction,
  revokeEventAccessAction,
  updateEventAccessAction,
} from "./access-actions";
import {
  defaultGrantAreas,
  splitGrantAreas,
  type EventAccessAreaOption,
  type EventAccessCandidate,
  type EventAccessEntry,
} from "./event-access-shared";
import { AccessGrantForm } from "./access-grant-form";

function entryName(entry: EventAccessEntry): string {
  return entry.name || entry.email || "Unknown account";
}

/**
 * Who besides the organization's roles can reach this event (#1689): its
 * per-event grants and pending invites, with what each covers and who gave it.
 * Coordinators with `events: manage` read it; administrators add, change and
 * remove access here.
 */
export function AccessTab({
  eventId,
  eventName,
  timeZone,
}: {
  eventId: string;
  eventName: string;
  timeZone: string;
}) {
  const router = useRouter();
  const {
    data: state,
    loadError,
    refresh: refreshTabData,
  } = useTabData(() => getEventAccessAction(eventId), [eventId]);
  const [isRemoving, startRemove] = useTransition();
  const [editing, setEditing] = useState<EventAccessEntry | null>(null);

  const refresh = useCallback(() => {
    refreshTabData();
    router.refresh();
  }, [refreshTabData, router]);

  useRegisterTabRefresh<TabValue>("access", refresh);

  const handleRemove = useCallback(
    (entry: EventAccessEntry) => {
      startRemove(async () => {
        await runAction(() => revokeEventAccessAction(entry), {
          success:
            entry.kind === "invite"
              ? "Invitation withdrawn."
              : "Access removed.",
          onSuccess: refresh,
        });
      });
    },
    [refresh],
  );

  const areas = state?.areas;
  const canGrant = state?.canGrant ?? false;

  const columns = useMemo<PortalDataTableColumn<EventAccessEntry>[]>(
    () => [
      {
        key: "person",
        label: "Person",
        sortValue: entryName,
        cellClassName: "max-w-xs",
        render: (entry) => (
          <div className="flex flex-col gap-0.5">
            <span className="flex flex-wrap items-center gap-2 font-medium">
              <span className="truncate">{entryName(entry)}</span>
              {entry.kind === "invite" && (
                <Badge variant="muted">Invited</Badge>
              )}
            </span>
            {entry.name && entry.email && (
              <span className="app-muted truncate text-xs">{entry.email}</span>
            )}
          </div>
        ),
      },
      {
        key: "level",
        label: "Level",
        sortValue: (entry) => entry.level,
        render: (entry) => (entry.level === "manage" ? "Manage" : "View"),
      },
      {
        key: "areas",
        label: "Areas",
        render: (entry) => {
          const { active, withdrawn } = splitGrantAreas(
            entry.areas,
            areas ?? [],
          );
          return (
            <div className="flex flex-wrap gap-1">
              {active.map((area) => (
                <Badge
                  key={area.key}
                  variant={area.sensitive ? "warning" : "secondary"}
                >
                  {area.label}
                </Badge>
              ))}
              {withdrawn.map((area) => (
                <Badge
                  key={area.key}
                  variant="muted"
                  className="line-through"
                  title="No longer offered by the organization, so it gives no access"
                >
                  {area.label}
                </Badge>
              ))}
            </div>
          );
        },
      },
      {
        key: "granted",
        label: "Granted",
        hideBelow: "sm",
        sortValue: (entry) => entry.created_at,
        cellClassName: "app-muted text-sm",
        render: (entry) => (
          <div className="flex flex-col gap-0.5">
            <span>{entry.granted_by_name ?? "—"}</span>
            <ViewerTime
              iso={entry.created_at}
              fallbackZone={timeZone}
              className="text-xs"
            />
          </div>
        ),
      },
      ...(canGrant
        ? [
            {
              key: "actions",
              label: "Actions",
              srOnlyLabel: true,
              headClassName: "w-0",
              cellClassName: "text-right whitespace-nowrap",
              render: (entry: EventAccessEntry) => (
                <div className="flex justify-end gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditing(entry)}
                  >
                    Change
                  </Button>
                  <ConfirmDeleteButton
                    label={
                      entry.kind === "invite"
                        ? "Withdraw invitation"
                        : "Remove access"
                    }
                    title={`Remove ${entryName(entry)}'s access to ${eventName}?`}
                    description={
                      entry.kind === "invite"
                        ? "The invitation stops working. Their sign-in link no longer gives access to this event."
                        : "They lose access to this event at once. The audit log keeps a record."
                    }
                    confirmLabel="Remove"
                    pending={isRemoving}
                    onConfirm={() => handleRemove(entry)}
                  />
                </div>
              ),
            } satisfies PortalDataTableColumn<EventAccessEntry>,
          ]
        : []),
    ],
    [areas, canGrant, eventName, handleRemove, isRemoving, timeZone],
  );

  return (
    <div className="flex flex-col gap-3">
      {loadError && (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {state && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="app-muted max-w-2xl text-sm">
            {canGrant
              ? "People outside the organization's roles who can reach this event, such as a partner's coordinator. They see only the areas you give them."
              : "People outside the organization's roles who can reach this event. Only an administrator can change who has access."}
          </p>
          {canGrant && (
            <GrantAccessDialog
              eventId={eventId}
              areas={state.areas}
              onSaved={refresh}
            />
          )}
        </div>
      )}

      {state === undefined ? (
        <TabLoadingSkeleton />
      ) : state.entries.length === 0 ? (
        <EmptyState
          title="No one else has access"
          description={
            canGrant
              ? "Give a partner access to this event with Give access above."
              : "Only people with a role in the organization can reach this event."
          }
        />
      ) : (
        <PortalDataTable
          columns={columns}
          rows={state.entries}
          getRowKey={(entry) => `${entry.kind}:${entry.id}`}
          defaultSort={{ key: "granted", dir: "asc" }}
          emptyMessage="No access to show."
          shell="bare"
        />
      )}

      {state && editing && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
        >
          <PortalFormPopup
            size="lg"
            title={`Change ${entryName(editing)}'s access`}
            description={`What they can reach on ${eventName}.`}
          >
            <AccessGrantForm
              areas={state.areas}
              initial={{ level: editing.level, areas: editing.areas }}
              submitLabel="Save access"
              onSubmit={async (input) => {
                const result = await updateEventAccessAction(editing, input);
                if ("success" in result) {
                  setEditing(null);
                  refresh();
                }
                return result;
              }}
              onCancel={() => setEditing(null)}
            />
          </PortalFormPopup>
        </Dialog>
      )}
    </div>
  );
}

function GrantAccessDialog({
  eventId,
  areas,
  onSaved,
}: {
  eventId: string;
  areas: EventAccessAreaOption[];
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [candidates, setCandidates] = useState<EventAccessCandidate[] | null>(
    null,
  );

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next && candidates === null) {
      listEventAccessCandidatesAction().then((result) => {
        setCandidates("data" in result ? result.data : []);
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="secondary"
            className="shrink-0 whitespace-nowrap"
          />
        }
      >
        + Give access
      </DialogTrigger>
      <PortalFormPopup
        size="lg"
        title="Give access to this event"
        description="They see this event only, and only the areas you pick. Access lasts until it is removed."
      >
        {candidates === null ? (
          <TabLoadingSkeleton />
        ) : (
          <AccessGrantForm
            areas={areas}
            initial={{ level: "view", areas: defaultGrantAreas(areas) }}
            candidates={candidates}
            submitLabel="Give access"
            onSubmit={async (input, who) => {
              if (!who) return { error: "Pick who to give access to." };
              const outcome = await runAction(
                () => grantEventAccessAction(eventId, who, input),
                {
                  success: (result) =>
                    result.emailed
                      ? "Access given. We emailed them."
                      : "Access given. No email went out, so let them know yourself.",
                  onError: () => {},
                },
              );
              if (outcome.ok) {
                setOpen(false);
                onSaved();
                return { success: true };
              }
              return { error: outcome.message };
            }}
            onCancel={() => setOpen(false)}
          />
        )}
      </PortalFormPopup>
    </Dialog>
  );
}
