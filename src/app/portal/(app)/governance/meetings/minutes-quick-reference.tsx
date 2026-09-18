"use client";

import { useTransition } from "react";
import { BookOpen } from "lucide-react";
import {
  listCarriedOverActionItemsAction,
  type ActionItem,
} from "./action-items-actions";
import { listDecisionsAction, type Decision } from "./decisions-actions";
import {
  listMeetingAttendeesAction,
  updateMeetingAttendeeAction,
  type MeetingAttendee,
} from "./attendees-actions";
import {
  getPreviousMeetingMinutesAction,
  type PreviousMeetingMinutes,
} from "./minutes-approval-actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useRecordPreview } from "@/components/portal/record-preview-sheet";
import { useTabData } from "@/hooks/use-tab-data";
import { runAction } from "@/components/portal/action-toast";
import {
  formatCalendarDate,
  formatInstantDate,
  personDisplayName,
} from "@/lib/format";

/**
 * What a notetaker leaves the minutes to look up, brought to them (#1201).
 *
 * The complaint behind #1199-#1201 was navigation: "i've found myself
 * navigating away from taking minutes in the agenda page to look at something
 * else in the portal." #1200 made leaving safe by autosaving; this makes it
 * mostly unnecessary. Everything here is already a query away -- open and
 * carried-over action items, this meeting's decisions, who is in the room,
 * what the last meeting decided -- just on other tabs and other pages.
 *
 * Read-only lists are most of the value, which is why the two things that
 * write (the attendance toggle and inline add) are the first things to cut if
 * this has to shrink.
 */

type QuickReferenceProps = {
  meetingId: string;
  /** The meeting's own date: what "previous meeting" is measured against. */
  meetingDate: string;
  /**
   * This meeting's action items, from the editor rather than a sixth fetch of
   * the same rows. The editor already holds them (it renders them under each
   * snapshot item) and refreshes them when one is added, so re-fetching here
   * would mean two copies that disagree for as long as one of them is stale.
   */
  actionItems: ActionItem[];
  /**
   * Opens the shared add-action-item dialog with no `minutes_item_key`. The
   * dialog itself stays in the editor, which already owns one: an item raised
   * out of band differs from one raised under a section by that null and
   * nothing else, so a second copy of the form would be a second thing to keep
   * in step.
   */
  onAddActionItem: () => void;
  /** Flushes the autosave, then jumps to the overview's decisions section. */
  onViewDecisions: () => void;
};

function SectionHeading({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <p className="app-muted text-xs font-semibold tracking-[0.1em] uppercase">
        {title}
      </p>
      {action}
    </div>
  );
}

function Empty({ children }: { children: string }) {
  return <p className="app-muted text-sm">{children}</p>;
}

function ActionItemList({ items }: { items: ActionItem[] }) {
  return (
    <ul className="mt-1 flex flex-col gap-1 text-sm">
      {items.map((item) => (
        <li key={item.id}>
          {item.description}
          <span className="app-muted">
            {" — "}
            {personDisplayName(item.owner)}
            {item.due_date && ` (due ${formatCalendarDate(item.due_date)})`}
          </span>
        </li>
      ))}
    </ul>
  );
}

function DecisionList({ decisions }: { decisions: Decision[] }) {
  return (
    <ul className="mt-1 flex flex-col gap-1 text-sm">
      {decisions.map((decision) => (
        <li key={decision.id}>
          {decision.topic && (
            <span className="font-medium">{decision.topic}: </span>
          )}
          {decision.description}
          {decision.vote_result && (
            <span className="app-muted"> ({decision.vote_result})</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function AttendeeList({
  attendees,
  onToggle,
  disabled,
}: {
  attendees: MeetingAttendee[];
  onToggle: (attendee: MeetingAttendee) => void;
  disabled: boolean;
}) {
  return (
    <ul className="mt-1 flex flex-col gap-1 text-sm">
      {attendees.map((attendee) => (
        <li key={attendee.id}>
          <label className="flex items-center gap-2">
            <Checkbox
              checked={attendee.attended}
              disabled={disabled}
              onCheckedChange={() => onToggle(attendee)}
            />
            {personDisplayName(attendee.person)}
          </label>
        </li>
      ))}
    </ul>
  );
}

/** The panel's contents, identical under the aside and under the sheet. */
export function MinutesQuickReferenceBody({
  meetingId,
  meetingDate,
  actionItems,
  onAddActionItem,
  onViewDecisions,
}: QuickReferenceProps) {
  const [isSaving, startSave] = useTransition();

  const { data: attendees, refresh: refreshAttendees } = useTabData<
    MeetingAttendee[]
  >(() => listMeetingAttendeesAction(meetingId), [meetingId]);
  const { data: carriedOver } = useTabData<ActionItem[]>(
    () => listCarriedOverActionItemsAction(meetingId, meetingDate),
    [meetingId, meetingDate],
  );
  const { data: decisions } = useTabData<Decision[]>(
    () => listDecisionsAction(meetingId),
    [meetingId],
  );
  const { data: previousMeeting } = useTabData<PreviousMeetingMinutes | null>(
    () => getPreviousMeetingMinutesAction(meetingId, meetingDate),
    [meetingId, meetingDate],
  );

  function toggleAttendance(attendee: MeetingAttendee) {
    startSave(async () => {
      await runAction(
        () => updateMeetingAttendeeAction(attendee.id, !attendee.attended),
        { success: "Attendance updated.", onSuccess: refreshAttendees },
      );
    });
  }

  const openItems = actionItems.filter((item) => item.status === "open");

  return (
    <div className="flex flex-col gap-5">
      <div>
        <SectionHeading title="Who's here" />
        {attendees === undefined ? (
          <Empty>Loading...</Empty>
        ) : attendees.length === 0 ? (
          <Empty>Nobody is listed for this meeting yet.</Empty>
        ) : (
          <AttendeeList
            attendees={attendees}
            onToggle={toggleAttendance}
            disabled={isSaving}
          />
        )}
      </div>

      <div>
        <SectionHeading title="Carried over" />
        {(carriedOver ?? []).length === 0 ? (
          <Empty>Nothing open from an earlier meeting.</Empty>
        ) : (
          <ActionItemList items={carriedOver ?? []} />
        )}
      </div>

      <div>
        <SectionHeading
          title="Open today"
          action={
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto p-0"
              onClick={onAddActionItem}
            >
              Add
            </Button>
          }
        />
        {openItems.length === 0 ? (
          <Empty>None raised yet.</Empty>
        ) : (
          <ActionItemList items={openItems} />
        )}
      </div>

      <div>
        <SectionHeading
          title="Decisions"
          action={
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto p-0"
              onClick={onViewDecisions}
            >
              View all
            </Button>
          }
        />
        {(decisions ?? []).length === 0 ? (
          <Empty>None recorded yet.</Empty>
        ) : (
          <DecisionList decisions={decisions ?? []} />
        )}
      </div>

      <div>
        <SectionHeading title="Last meeting" />
        {!previousMeeting ? (
          <Empty>This is the earliest meeting on record.</Empty>
        ) : (
          <>
            <p className="app-muted text-sm">
              {formatInstantDate(previousMeeting.meetingDate)}
            </p>
            {previousMeeting.decisions.length === 0 ? (
              <Empty>It recorded no decisions.</Empty>
            ) : (
              <DecisionList decisions={previousMeeting.decisions} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Desktop: a column beside the notes that scrolls on its own.
 *
 * `self-start` is load-bearing. A grid item stretches to its row's height by
 * default, which makes the aside as tall as the notes column and leaves the
 * sticky offset nothing to stick to.
 *
 * It pins below `--portal-header-height`, not at the top of the viewport --
 * the same offset `Table`'s `stickyHeader="page"` uses, and for the same
 * reason: the portal's top bar is itself `sticky top-0`, so a panel pinned any
 * higher slides its first section under the bar and out of sight.
 */
export function MinutesQuickReferenceAside(props: QuickReferenceProps) {
  return (
    <aside
      aria-label="Quick reference"
      className="sticky top-[calc(var(--portal-header-height)+1rem)] max-h-[calc(100vh-var(--portal-header-height)-2rem)] self-start overflow-y-auto rounded-lg border border-[var(--line)] p-4"
    >
      <MinutesQuickReferenceBody {...props} />
    </aside>
  );
}

/**
 * Phone: the same contents behind a button, because there is no second column
 * to put them in and stacking them under twelve textareas is not reference
 * material -- it is more scrolling.
 *
 * The sheet itself belongs to `RecordPreviewProvider` since #1225, not to this
 * component. On a phone a referenced event opens into that same sheet, in
 * place of this panel; owning two of them would put a second backdrop and a
 * second scroll container over a 390px screen. So this is the trigger, and the
 * body it opens is `MinutesQuickReferenceBody`, handed to the provider as its
 * host.
 */
export function MinutesQuickReferenceTrigger() {
  const preview = useRecordPreview();
  if (!preview?.hasHost) return null;

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={(event) => preview.openHost(event.currentTarget)}
    >
      <BookOpen /> Reference
    </Button>
  );
}
