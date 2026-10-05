"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Ban, Check, Download, Eye, Snowflake, Undo2 } from "lucide-react";
import type {
  EventRegistrant,
  EventRegistrantsData,
} from "./registrants-actions";
import { REGISTRANT_PARAM } from "./registrant-detail-sheet";
import { AnnounceToRegistrantsDialog } from "./announce-to-registrants-dialog";
import { AskForMissingAnswersDialog } from "./ask-for-missing-answers-dialog";
import { RegistrantBadges } from "./registrant-badges";
import {
  CancelledRegistrations,
  RegistrantAnnouncementsSection,
  RegistrantOverlays,
} from "./registrants-shared";
import { useRegistrantRowActions } from "./use-registrant-row-actions";
import { isMissingRequired } from "./registrants-view-state";
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
import { formatOptionCounts } from "@/lib/registration-options";
import type { RegistrationQuestion } from "@/lib/registration-questions";
import {
  answerCellText,
  answerColumnLabel,
  answerColumns,
  shownAnswerColumns,
} from "@/lib/registration-answer-columns";
import type { TabData } from "@/hooks/use-tab-data";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  PortalDataTable,
  withoutSorting,
  type PortalDataTableColumn,
} from "@/components/portal/data-table";
import { TabLoadingSkeleton } from "@/components/portal/tab-loading-skeleton";
import { LIST_PREVIEW_ROWS } from "@/components/portal/list-preview-sheet";
import { formatDateTime } from "@/lib/format";
import { EmptyState } from "@/components/portal/empty-state";

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

const NO_QUESTIONS: RegistrationQuestion[] = [];

/** Where the answers export is served; see its route handler. */
export function registrantAnswersCsvHref(eventId: string): string {
  return `/portal/events/${encodeURIComponent(eventId)}/registrants/answers`;
}

/** The registrants page (#1511), which the card's "View all" opens. */
export function registrantsPageHref(eventId: string): string {
  return `/portal/events/${encodeURIComponent(eventId)}/registrants`;
}

/**
 * #1512. One column per top-level question, headed by its short label, with
 * conditional follow-ups folded into their parent's cell; nothing at all for
 * an event that asks none. `picked` is the registrants page's Columns menu --
 * null shows the first few, which is all the card's preview ever shows.
 */
export function registrationAnswerColumns(
  registrationQuestions: readonly RegistrationQuestion[],
  picked: readonly string[] | null = null,
): PortalDataTableColumn<EventRegistrant>[] {
  return shownAnswerColumns(answerColumns(registrationQuestions), picked).map(
    (column) => {
      const label = answerColumnLabel(column.question);
      return {
        key: `question-${column.question.id}`,
        label,
        headTitle:
          label === column.question.prompt ? undefined : column.question.prompt,
        sortValue: (registrant: EventRegistrant) =>
          answerCellText(column, registrant.answers),
        // From 2xl only: three of these beside the rest of a registration
        // need ~1260px, more than a 1280px desk has beside the sidebar, and
        // the registrants page must not scroll sideways there (#1511). Below
        // 2xl the row's disclosure and the detail sheet carry the answers.
        hideBelow: "2xl",
        // Wrapping, so a 24-character label is not what sets the width: the
        // page's column is 1152px however wide the screen.
        headClassName: "min-w-24 whitespace-normal",
        // One line a row, whatever was typed: a long free-text answer is cut
        // here and read in full in the detail sheet.
        cellClassName: "app-muted text-xs whitespace-nowrap",
        render: (registrant: EventRegistrant) => {
          const text = answerCellText(column, registrant.answers);
          return text === null ? (
            "—"
          ) : (
            // The cap is on the span: a table cell's own max-width is not
            // reliably honoured.
            <span className="block max-w-36 truncate" title={text}>
              {text}
            </span>
          );
        },
      } satisfies PortalDataTableColumn<EventRegistrant>;
    },
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
   * Rows shown before "View all" links to the registrants page (#1511).
   * `null` renders the whole list with no link — which is what the Happening
   * Now check-in sheet needs, since capping the list there would hide the very
   * rows it exists to work through. Numeric overrides keep tests from having
   * to build six registrants.
   */
  previewRows?: number | null;
  /**
   * Create actions, for a surface with no header of its own to put them in:
   * the check-in sheet. Rendered only with `previewRows={null}`; the card has
   * them in its own header already.
   */
  headerActions?: ReactNode;
}) {
  const router = useRouter();
  const { data, loadError } = registrantsData;
  const registrants = data?.registrants;
  const messaging = data?.messaging ?? null;
  // #1407. Null for the events that ask no registration question, which
  // leaves the tab exactly as it was.
  const registrationOptions = data?.registrationOptions ?? null;
  // #1501. Empty for the events that ask no questions, which likewise leaves
  // the tab exactly as it was.
  const registrationQuestions = data?.registrationQuestions ?? NO_QUESTIONS;
  const asksRequired = registrationQuestions.some(
    (question) => question.required,
  );
  // `messaging` is populated only for a caller holding `events: manage`, which
  // is the same gate the sheet's messaging half and the announcement composer
  // are behind -- so one nullable read answers "may this person write to
  // registrants?" without a second permissions round trip in the client.
  const canManage = messaging !== null;
  const refreshRegistrants = registrantsData.refresh;
  const refreshDerived = derived.refresh;
  const [riderTarget, setRiderTarget] = useState<EventRegistrant | null>(null);
  // #1418
  const [cancelTarget, setCancelTarget] = useState<EventRegistrant | null>(
    null,
  );
  const [missingOnly, setMissingOnly] = useState(false);

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

  const { toggleCheckIn, restore, isRowPending } =
    useRegistrantRowActions(refreshAll);

  const list = useMemo(() => registrants ?? [], [registrants]);
  const cancelledList = data?.cancelled ?? [];
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

  // #1501. Only offered where some question is required; a stale toggle on
  // an event whose last required question was removed filters nothing.
  const missingCount = useMemo(
    () =>
      asksRequired
        ? list.filter((registrant) =>
            isMissingRequired(registrant, registrationQuestions),
          ).length
        : 0,
    [asksRequired, list, registrationQuestions],
  );
  const shownList = useMemo(
    () =>
      asksRequired && missingOnly
        ? list.filter((registrant) =>
            isMissingRequired(registrant, registrationQuestions),
          )
        : list,
    [asksRequired, missingOnly, list, registrationQuestions],
  );

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
            <RegistrantBadges registrant={registrant} />
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
      ...(registrationOptions
        ? [
            {
              key: "options",
              label: "Options",
              sortValue: (registrant: EventRegistrant) =>
                formatOptionCounts(registrant.option_counts),
              hideBelow: "md",
              // One line per option, capped: the labels are the tenant's own
              // sentences and would otherwise widen the table past the screen.
              cellClassName:
                "app-muted min-w-40 max-w-56 text-xs whitespace-normal",
              render: (registrant: EventRegistrant) =>
                registrant.option_counts.length > 0
                  ? [...registrant.option_counts]
                      .sort((a, b) => a.sort_order - b.sort_order)
                      .map((row) => (
                        <span key={row.label} className="block">
                          {row.quantity} × {row.label}
                        </span>
                      ))
                  : "—",
            } satisfies PortalDataTableColumn<EventRegistrant>,
          ]
        : []),
      ...registrationAnswerColumns(registrationQuestions),
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
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Registration details for ${registrant.name}`}
                    onClick={() => setDetailId(registrant.id)}
                  />
                }
              >
                <Eye />
              </TooltipTrigger>
              <TooltipContent>{`Registration details for ${registrant.name}`}</TooltipContent>
            </Tooltip>
            {mode === "edit" && (
              <>
                {/* The profile hangs off the person record, so a
                    registration never linked to one has nowhere to put it —
                    link it from the People module first. */}
                {registrant.rider && registrant.person_id && (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Rider profile for ${registrant.name}`}
                          onClick={() => setRiderTarget(registrant)}
                        />
                      }
                    >
                      <Snowflake />
                    </TooltipTrigger>
                    <TooltipContent>{`Rider profile for ${registrant.name}`}</TooltipContent>
                  </Tooltip>
                )}
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={
                          registrant.checked_in_at
                            ? "Undo check-in"
                            : "Check in"
                        }
                        disabled={isRowPending(registrant)}
                        onClick={() => toggleCheckIn(registrant)}
                      />
                    }
                  >
                    {registrant.checked_in_at ? <Undo2 /> : <Check />}
                  </TooltipTrigger>
                  <TooltipContent>
                    {registrant.checked_in_at ? "Undo check-in" : "Check in"}
                  </TooltipContent>
                </Tooltip>
                {/* #1418. Not once they are through the door: undo the
                    check-in first, which the database insists on too. */}
                {canManage && registrant.checked_in_at === null && (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Cancel registration for ${registrant.name}`}
                          onClick={() => setCancelTarget(registrant)}
                        />
                      }
                    >
                      <Ban />
                    </TooltipTrigger>
                    <TooltipContent>{`Cancel registration for ${registrant.name}`}</TooltipContent>
                  </Tooltip>
                )}
              </>
            )}
          </>
        ),
      } satisfies PortalDataTableColumn<EventRegistrant>,
    ],
    [
      registrationOptions,
      registrationQuestions,
      showAttendedBefore,
      showRides,
      mode,
      canManage,
      isRowPending,
      toggleCheckIn,
    ],
  );

  // Only the copy that holds every row may claim to order them; see
  // `withoutSorting`.
  const previewColumns = useMemo(() => withoutSorting(columns), [columns]);

  const capped =
    previewRows === null ? shownList : shownList.slice(0, previewRows);
  const hasOverflow = previewRows !== null && shownList.length > previewRows;
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
        {/* #1407. Per option, against its cap where it has one: the number
            an organizer orders tickets or gear from. */}
        {registrationOptions && (
          <span className="block">
            {registrationOptions.options
              .map(
                (option) =>
                  `${option.label}: ${option.taken}${option.cap === null ? "" : ` of ${option.cap}`}`,
              )
              .join(" · ")}
          </span>
        )}
      </>
    );

  // #1501. Behind `events: manage` here and, more to the point, in the route
  // handler itself, since a link is only a link.
  const downloadAction =
    canManage && registrationQuestions.length > 0 ? (
      // A styled anchor rather than <Button render={<a/>}>: it is a file
      // download, and should be announced and behave as a link.
      <a
        href={registrantAnswersCsvHref(eventId)}
        download
        className={buttonVariants({ variant: "secondary" })}
      >
        <Download /> Download answers (CSV)
      </a>
    ) : null;

  const missingFilter =
    asksRequired && list.length > 0 ? (
      <Button
        type="button"
        variant={missingOnly ? "default" : "secondary"}
        aria-pressed={missingOnly}
        onClick={() => setMissingOnly((on) => !on)}
      >
        Missing required answers ({missingCount})
      </Button>
    ) : null;

  // #1502. Beside the announcement composer, and only where there is
  // something to ask: a required question somebody has left unanswered.
  const askAction =
    canManage && messaging && missingCount > 0 ? (
      <AskForMissingAnswersDialog
        eventId={eventId}
        eventName={eventName}
        registrations={list}
        questions={registrationQuestions}
        onSent={refreshAll}
        disabledReason={
          messaging.orgEmailEnabled
            ? undefined
            : "Outbound email is switched off for this organization."
        }
      />
    ) : null;

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

      {(summary ||
        (previewRows === null && headerActions) ||
        announceAction ||
        askAction ||
        downloadAction ||
        missingFilter) && (
        <div className="flex flex-wrap items-start justify-between gap-2">
          {summary ? <p className="app-muted text-sm">{summary}</p> : <span />}
          <div className="flex flex-wrap gap-2">
            {previewRows === null && headerActions}
            {missingFilter}
            {downloadAction}
            {askAction}
            {announceAction}
          </div>
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

          {/* A page, not a sheet (#1511): the full list hosts the door's
              check-in loop, walk-ins, messaging and export, and a surface
              doing that much is a destination with a URL of its own. The
              missing-answers toggle carries over so the count matches. */}
          {hasOverflow && (
            <Link
              href={`${registrantsPageHref(eventId)}${missingOnly ? "?missing=1" : ""}`}
              className={buttonVariants({
                variant: "ghost",
                className: "w-full",
              })}
            >
              View all {shownList.length} registrants
            </Link>
          )}
        </>
      )}

      <CancelledRegistrations
        cancelled={cancelledList}
        canRestore={mode === "edit" && canManage}
        onRestore={restore}
        isRowPending={isRowPending}
      />

      <RegistrantAnnouncementsSection data={data} />

      <RegistrantOverlays
        data={data}
        eventName={eventName}
        detailId={detailId}
        onDetailClosed={() => setDetailId(null)}
        cancelTarget={cancelTarget}
        onCancelClosed={() => setCancelTarget(null)}
        riderTarget={riderTarget}
        onRiderClosed={() => setRiderTarget(null)}
        onChanged={refreshAll}
        onRegistrantsChanged={refreshRegistrants}
      />
    </div>
  );
}
