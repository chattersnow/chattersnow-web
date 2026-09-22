"use client";

import {
  useCallback,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Eye, Snowflake, Undo2 } from "lucide-react";
import {
  checkInRegistrantAction,
  undoCheckInAction,
  type EventRegistrant,
  type EventRegistrantsData,
} from "./registrants-actions";
import { RiderProfileDialog } from "./rider-profile-dialog";
import {
  REGISTRANT_PARAM,
  RegistrantDetailSheet,
} from "./registrant-detail-sheet";
import { RegistrantAnnouncements } from "./registrant-announcements";
import { AnnounceToRegistrantsDialog } from "./announce-to-registrants-dialog";
import { announcementBatches } from "@/lib/event-announcements";
import { NO_RECORD_MESSAGES } from "@/lib/outbound-messages";
import {
  experienceLevelLabel,
  ridingDisciplineLabel,
} from "@/lib/rider-profile";
import {
  attendedBeforeLabel,
  countSelfReportedFirstTimers,
  hasAnyAttendedBeforeAnswer,
} from "@/lib/attended-before";
import type { EventImpactDerived } from "@/lib/portal/impact-metrics";
import type { TabData } from "@/hooks/use-tab-data";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  PortalDataTable,
  withoutSorting,
  type PortalDataTableColumn,
} from "@/components/portal/data-table";
import { StatusBadge } from "@/components/portal/status-badge";
import { TabLoadingSkeleton } from "@/components/portal/tab-loading-skeleton";
import {
  LIST_PREVIEW_ROWS,
  ListPreviewSheet,
} from "@/components/portal/list-preview-sheet";
import { formatDateTime } from "@/lib/format";
import { EmptyState } from "@/components/portal/empty-state";
import { runAction } from "@/components/portal/action-toast";

/**
 * What the door sees in the Rides column.
 *
 * Reads the level snapshotted at check-in, falling back to the person's current
 * profile only when there is no snapshot at all — the same all-or-nothing rule
 * the impact RPCs apply, so the column and the Impact card's beginner figure can
 * never disagree.
 */
function ridesSummary(registrant: EventRegistrant): string | null {
  const rider = registrant.rider;
  if (!rider) return null;

  const snapshot = rider.riding_discipline_at_event !== null;
  const discipline = ridingDisciplineLabel(
    snapshot ? rider.riding_discipline_at_event : rider.riding_discipline,
  );
  if (!discipline) return null;

  const levels = [
    experienceLevelLabel(
      snapshot
        ? rider.ski_experience_level_at_event
        : rider.ski_experience_level,
    ),
    experienceLevelLabel(
      snapshot
        ? rider.snowboard_experience_level_at_event
        : rider.snowboard_experience_level,
    ),
  ].filter((level): level is string => level !== null);

  const distinct = [...new Set(levels)];
  return distinct.length > 0
    ? `${discipline} · ${distinct.join(" / ")}`
    : discipline;
}

function matchesQuery(registrant: EventRegistrant, needle: string): boolean {
  return [registrant.name, registrant.email, registrant.phone].some(
    (field) => field?.toLowerCase().includes(needle) ?? false,
  );
}

export function RegistrantsTab({
  eventId,
  eventName,
  capacity,
  mode,
  registrants: registrantsData,
  derived,
  previewRows = LIST_PREVIEW_ROWS,
  headerActions,
}: {
  eventId: string;
  /** Names the event in a message's default subject and an announcement's. */
  eventName: string;
  capacity: number | null;
  mode: "view" | "edit";
  registrants: TabData<EventRegistrantsData>;
  derived: TabData<EventImpactDerived>;
  /**
   * Rows shown before the rest move behind "View all". `null` renders the whole
   * list with no trigger — which is what the Happening Now check-in sheet needs,
   * since capping the list there would hide the very rows it exists to work
   * through, and its trigger would open a sheet inside a sheet. Numeric
   * overrides keep tests from having to build six registrants.
   */
  previewRows?: number | null;
  /** Create actions mirrored into the sheet header. */
  headerActions?: ReactNode;
}) {
  const router = useRouter();
  const { data, loadError } = registrantsData;
  const registrants = data?.registrants;
  const messages = data?.messages ?? NO_RECORD_MESSAGES;
  const messaging = data?.messaging ?? null;
  // False while the tab is still loading, which is the right default: it only
  // suppresses a row, and the row reappears with the data behind it (#686).
  const waiverInForce = data?.waiverInForce ?? false;
  // Same default and same reasoning (#599).
  const photoConsentInForce = data?.photoConsentInForce ?? false;
  // `messaging` is populated only for a caller holding `events: manage`, which
  // is the same gate the sheet's messaging half and the announcement composer
  // are behind -- so one nullable read answers "may this person write to
  // registrants?" without a second permissions round trip in the client.
  const canManage = messaging !== null;
  const refreshRegistrants = registrantsData.refresh;
  const refreshDerived = derived.refresh;
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [riderTarget, setRiderTarget] = useState<EventRegistrant | null>(null);
  const [query, setQuery] = useState("");

  // A notification can link straight at one registration (#742's shape). The
  // list arrives from a Server Action rather than the page's own render, so
  // the parameter is read here and the sheet opens as soon as the row it names
  // is in hand; RegistrantDetailSheet takes it back out of the URL on close.
  const linkedId = useSearchParams().get(REGISTRANT_PARAM);
  const [detailId, setDetailId] = useState<string | null>(linkedId);
  // A second deep link arriving while this tab is already mounted re-renders
  // it in place, which the initializer above would miss. Adjusting state
  // during render is React's documented pattern for that, and unlike an effect
  // it never lets the stale sheet paint.
  const [prevLinkedId, setPrevLinkedId] = useState(linkedId);
  if (linkedId !== prevLinkedId) {
    setPrevLinkedId(linkedId);
    if (linkedId) setDetailId(linkedId);
  }

  // Stable, so the column list below only rebuilds when something it renders
  // differently changes.
  const refreshAll = useCallback(() => {
    refreshRegistrants();
    refreshDerived();
    router.refresh();
  }, [refreshRegistrants, refreshDerived, router]);

  const handleToggleCheckIn = useCallback(
    (registrant: EventRegistrant) => {
      setPendingId(registrant.id);
      startTransition(async () => {
        const undo = registrant.checked_in_at !== null;
        await runAction(
          () =>
            undo
              ? undoCheckInAction(registrant.id)
              : checkInRegistrantAction(registrant.id),
          {
            success: undo
              ? `Undid ${registrant.name}'s check-in.`
              : `${registrant.name} checked in.`,
            // Only a success refreshes. This is the door: an expired session or
            // an account without `events: manage` both leave the row exactly as
            // it was, and repainting it unchanged is what made a refusal look
            // like a completed check-in (#1124).
            onSuccess: refreshAll,
          },
        );
        setPendingId(null);
      });
    },
    [refreshAll],
  );

  const list = useMemo(() => registrants ?? [], [registrants]);
  const totalAttending = list.reduce(
    (sum, registrant) => sum + registrant.party_size,
    0,
  );
  const checkedInCount = list.filter((r) => r.checked_in_at !== null).length;
  // Null across the board means this viewer isn't cleared for rider data.
  // Derived from the whole list, not the preview slice, so the column doesn't
  // appear and disappear between the card and the sheet.
  const showRides = list.some((registrant) => registrant.rider !== null);
  // #1259. The column and the count appear only once somebody has answered:
  // before this shipped every row is null, and a column of dashes is a column
  // that costs width and says nothing. Derived from the whole list for the
  // same reason `showRides` is, so it does not appear and disappear between
  // the card and the sheet.
  const showAttendedBefore = hasAnyAttendedBeforeAnswer(list);
  const selfReportedFirstTimers = countSelfReportedFirstTimers(list);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((registrant) => matchesQuery(registrant, needle));
  }, [list, query]);

  const columns = useMemo<PortalDataTableColumn<EventRegistrant>[]>(
    () => [
      {
        key: "name",
        label: "Name",
        sortValue: (registrant) => registrant.name,
        cellClassName: "max-w-xs font-medium",
        render: (registrant) => (
          <>
            <span className="block truncate" title={registrant.name}>
              {registrant.name}
            </span>
            {/* Under the name rather than in a column of its own: the door
                reads it at the same moment it reads who this is, and the
                table is already wide enough to drop columns on small
                screens. */}
            {registrant.pronouns && (
              <span className="app-muted block truncate text-xs font-normal">
                {registrant.pronouns}
              </span>
            )}
            {/* Beside the name, not in a column, and for the reason the
                pronouns are here: this is read at the same moment as "who is
                this", it is the one thing about a party that has to be known
                before the day rather than at it, and a column would be the
                first thing dropped on a phone. Only `true` renders anything --
                null is "nobody was asked" and false is the ordinary case, and
                neither is worth a badge (#685). */}
            {registrant.party_includes_minor === true && (
              <StatusBadge tone="info" className="mt-1 font-normal">
                Includes a minor
              </StatusBadge>
            )}
            {/* Same place, same argument, and the condition is inverted (#599).
                For the minors flag the notable state is `true`; here it is
                `false` -- somebody who declined being photographed is the one
                registrant a camera has to know about, and "agreed" is the
                ordinary case that would only add noise. Null renders nothing
                because nobody asked, and a badge saying so would put a gap in
                the organization's own configuration in front of the door shift.

                This is also the check-in surface: `check-in-modal.tsx` renders
                this same table, so the badge is there without a second copy. */}
            {registrant.photo_consent === false && (
              <StatusBadge tone="warning" className="mt-1 font-normal">
                No photos
              </StatusBadge>
            )}
          </>
        ),
      },
      {
        key: "contact",
        label: "Contact",
        sortValue: (registrant) => registrant.email,
        hideBelow: "md",
        cellClassName: "app-muted",
        render: (registrant) => (
          <>
            {registrant.email}
            {registrant.phone && (
              <span className="block text-xs">{registrant.phone}</span>
            )}
          </>
        ),
      },
      {
        key: "party_size",
        label: "Party size",
        sortValue: (registrant) => registrant.party_size,
        hideBelow: "sm",
        render: (registrant) => registrant.party_size,
      },
      {
        key: "created_at",
        label: "Registered",
        sortValue: (registrant) => registrant.created_at,
        hideBelow: "lg",
        cellClassName: "app-muted whitespace-nowrap",
        render: (registrant) => formatDateTime(registrant.created_at),
      },
      ...(showAttendedBefore
        ? [
            {
              key: "attended_before",
              label: "Been before",
              // Unanswered sorts apart from both answers rather than with the
              // "No"s: it is a third state, and a door reading this column
              // has to be able to tell "said no" from "was never asked".
              sortValue: (registrant: EventRegistrant) =>
                registrant.attended_before === null
                  ? ""
                  : registrant.attended_before
                    ? "1"
                    : "0",
              hideBelow: "md",
              cellClassName: "app-muted whitespace-nowrap",
              render: (registrant: EventRegistrant) =>
                attendedBeforeLabel(registrant.attended_before) ?? "—",
            } satisfies PortalDataTableColumn<EventRegistrant>,
          ]
        : []),
      ...(showRides
        ? [
            {
              key: "rides",
              label: "Rides",
              sortValue: (registrant: EventRegistrant) =>
                ridesSummary(registrant),
              hideBelow: "lg",
              cellClassName: "app-muted",
              render: (registrant: EventRegistrant) =>
                ridesSummary(registrant) ?? "—",
            } satisfies PortalDataTableColumn<EventRegistrant>,
          ]
        : []),
      {
        key: "checked_in_at",
        label: "Checked in",
        sortValue: (registrant) => registrant.checked_in_at,
        cellClassName: "app-muted whitespace-nowrap",
        render: (registrant) => formatDateTime(registrant.checked_in_at),
      },
      {
        key: "actions",
        label: "Actions",
        srOnlyLabel: true,
        headClassName: "w-0",
        cellClassName: "text-right whitespace-nowrap",
        render: (registrant: EventRegistrant) => (
          <>
            {/* Always, whatever the page's edit toggle says: opening a
                registration to read a party size or a note is not editing,
                and the door staff who hold `events: view` are exactly who
                does it. What is inside the sheet is gated, not the sheet. */}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Registration details for ${registrant.name}`}
              onClick={() => setDetailId(registrant.id)}
            >
              <Eye />
            </Button>
            {mode === "edit" && (
              <>
                {/* The profile hangs off the person record, so a
                    registration never linked to one has nowhere to put it —
                    link it from the People module first. */}
                {registrant.rider && registrant.person_id && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Rider profile for ${registrant.name}`}
                    onClick={() => setRiderTarget(registrant)}
                  >
                    <Snowflake />
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={
                    registrant.checked_in_at ? "Undo check-in" : "Check in"
                  }
                  disabled={isPending && pendingId === registrant.id}
                  onClick={() => handleToggleCheckIn(registrant)}
                >
                  {registrant.checked_in_at ? <Undo2 /> : <Check />}
                </Button>
              </>
            )}
          </>
        ),
      } satisfies PortalDataTableColumn<EventRegistrant>,
    ],
    [
      showAttendedBefore,
      showRides,
      mode,
      isPending,
      pendingId,
      handleToggleCheckIn,
    ],
  );

  // Only the copy that holds every row may claim to order them; see
  // `withoutSorting`.
  const previewColumns = useMemo(() => withoutSorting(columns), [columns]);

  const capped = previewRows === null ? list : list.slice(0, previewRows);
  const hasOverflow = previewRows !== null && list.length > previewRows;
  const previewIsWholeList = !hasOverflow;

  const summary =
    registrants === undefined ? null : (
      <>
        {list.length} registration{list.length === 1 ? "" : "s"},{" "}
        {totalAttending} attending
        {capacity !== null && ` of ${capacity} capacity`} &middot;{" "}
        {checkedInCount} checked in
        {derived.data &&
          checkedInCount > 0 &&
          ` · ${derived.data.recurringParticipants} recurring, ${derived.data.firstTimeParticipants} first-time`}
        {/* Beside the derived figure above, never folded into it (#1259). The
            two count different things: that one is what the check-in ledger
            saw, this one is what people said about themselves on the way in,
            and only the first may reach an impact report. The wording carries
            the difference -- "said" is doing the work. */}
        {showAttendedBefore &&
          ` · ${selfReportedFirstTimers} said it would be their first`}
      </>
    );

  const detailTarget = list.find((registrant) => registrant.id === detailId);
  const batches = canManage ? announcementBatches(messages) : [];

  const announceAction =
    canManage && messaging ? (
      <AnnounceToRegistrantsDialog
        eventId={eventId}
        eventName={eventName}
        registrations={list}
        replyTo={messaging.replyTo}
        onSent={refreshAll}
        disabledReason={
          messaging.orgEmailEnabled
            ? undefined
            : "Outbound email is switched off for this organization."
        }
      />
    ) : null;

  return (
    <div className="flex flex-col gap-4">
      {loadError && (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {(summary || announceAction) && (
        <div className="flex flex-wrap items-start justify-between gap-2">
          {summary ? <p className="app-muted text-sm">{summary}</p> : <span />}
          {announceAction}
        </div>
      )}

      {registrants === undefined ? (
        <TabLoadingSkeleton />
      ) : list.length === 0 ? (
        <EmptyState
          title="No one has registered yet"
          description="Registrations arrive from the public event page. Walk-ins can be added with + Add registrant or + Check in walk-in above."
        />
      ) : (
        <>
          <PortalDataTable
            columns={previewIsWholeList ? columns : previewColumns}
            rows={capped}
            getRowKey={(registrant) => registrant.id}
            // listEventRegistrantsAction returns them in the order they
            // registered.
            defaultSort={
              previewIsWholeList ? { key: "created_at", dir: "asc" } : undefined
            }
            emptyMessage="No registrants to show."
            // The tab is already inside its own card on the phase grid -- and
            // inside the check-in sheet, which brings its own surface.
            shell="bare"
            stickyFirstColumn
          />

          {hasOverflow && (
            <ListPreviewSheet
              title="Registrants"
              description={summary}
              triggerLabel={`View all ${list.length} registrants`}
              searchPlaceholder="Search name, email, or phone"
              searchLabel="Search registrants"
              query={query}
              onQueryChange={setQuery}
              totalCount={list.length}
              filteredCount={filtered.length}
              actions={
                <>
                  {headerActions}
                  {announceAction}
                </>
              }
            >
              <PortalDataTable
                columns={columns}
                rows={filtered}
                getRowKey={(registrant) => registrant.id}
                defaultSort={{ key: "created_at", dir: "asc" }}
                emptyMessage="No registrants match your search. Clear or loosen it to see more."
                // The sheet body is the scroller here and brings its own
                // surface, so the header pins to the top of that rather than
                // to the portal's header.
                shell="bare"
                stickyHeader="container"
                stickyFirstColumn
              />
            </ListPreviewSheet>
          )}
        </>
      )}

      {/* Only once something has gone out. An empty card headed
          "Announcements" on every event would be a permanent reminder of a
          feature most events never need. */}
      {batches.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="app-muted text-sm font-semibold">Announcements</h3>
          <RegistrantAnnouncements batches={batches} actors={messages.actors} />
        </section>
      )}

      {/* Keyed by registrant, and mounted only for the one being read: the
          sheet seeds its own open state, so switching rows has to remount it
          rather than hand it a new registrant behind its back. */}
      {detailTarget && (
        <RegistrantDetailSheet
          key={detailTarget.id}
          registrant={detailTarget}
          eventName={eventName}
          canManage={canManage}
          messages={messages.byRecord[detailTarget.id] ?? []}
          messageActors={messages.actors}
          orgName={messaging?.orgName ?? ""}
          replyTo={messaging?.replyTo ?? null}
          orgEmailEnabled={messaging?.orgEmailEnabled ?? false}
          waiverInForce={waiverInForce}
          photoConsentInForce={photoConsentInForce}
          onClosed={() => setDetailId(null)}
          onSent={refreshRegistrants}
        />
      )}

      {/* Keyed so the form re-seeds from whichever registrant was opened.
          Rendered as a sibling of the sheet, not inside it: the house pattern
          for a second overlay, and it keeps the sheet standing behind the
          dialog so closing the profile returns you to your place in the list. */}
      {riderTarget && (
        <RiderProfileDialog
          key={riderTarget.id}
          registrant={riderTarget}
          open
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setRiderTarget(null);
          }}
          onSaved={refreshAll}
        />
      )}
    </div>
  );
}
