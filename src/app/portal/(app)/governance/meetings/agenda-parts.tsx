"use client";

import type { ReactNode } from "react";
import type { ActionItem } from "./action-items-actions";
import type { Decision } from "./decisions-actions";
import type { PreviousMeetingMinutes } from "./minutes-approval-actions";
import { MinutesApprovalDialog } from "./minutes-approval-dialog";
import { MeetingExportDialog } from "./meeting-export-dialog";
import {
  formatAgendaMarkdown,
  formatAgendaPlainText,
  type AgendaExportInput,
} from "./agenda-export";
import { APPROVE_MINUTES_ITEM, OPENING_CHECKLIST } from "./opening-checklist";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/portal/empty-state";
import { personDisplayName } from "@/lib/format";

/**
 * The pieces the board agenda and the simple agenda (#1623) both render. Kept
 * out of `agenda-tab.tsx` so `simple-agenda.tsx` can use them without the two
 * files importing each other.
 */

/**
 * The agenda's half of the shared export dialog (#1201): the dialog takes two
 * formatted strings, and this is where an agenda becomes them. The minutes tab
 * has the same three lines over `minutes-export.ts`.
 */
export function AgendaExport({ input }: { input: AgendaExportInput }) {
  return (
    <MeetingExportDialog
      title="Export agenda"
      markdown={formatAgendaMarkdown(input)}
      plainText={formatAgendaPlainText(input)}
    />
  );
}

export function ReadOnlySection({
  title,
  onViewAll,
  children,
}: {
  title: string;
  onViewAll?: () => void;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{title}</p>
        {onViewAll && (
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto p-0"
            onClick={onViewAll}
          >
            View all
          </Button>
        )}
      </div>
      <div className="mt-1">{children}</div>
    </div>
  );
}

/** The opening checklist, with the previous minutes' approval step live. */
export function AgendaOpening({
  meetingId,
  previousMinutes,
  minutesApprovedAt,
  canManage,
  onApproved,
}: {
  meetingId: string;
  previousMinutes: PreviousMeetingMinutes | null | undefined;
  minutesApprovedAt: string | null;
  canManage: boolean;
  onApproved: () => void;
}) {
  return (
    <div>
      <p className="text-sm font-semibold">Opening</p>
      <ul className="app-muted mt-1 list-disc pl-5 text-sm">
        {OPENING_CHECKLIST.map((item) => (
          <li key={item}>
            {item === APPROVE_MINUTES_ITEM && previousMinutes ? (
              <MinutesApprovalDialog
                meetingId={meetingId}
                previousMeeting={previousMinutes}
                approvedAt={minutesApprovedAt}
                canApprove={canManage}
                onApproved={onApproved}
              />
            ) : (
              item
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AgendaDecisions({
  decisions,
  onViewAll,
}: {
  decisions: Decision[];
  onViewAll: () => void;
}) {
  return (
    <ReadOnlySection title="Decisions & votes" onViewAll={onViewAll}>
      {decisions.length === 0 ? (
        <EmptyState
          className="py-4"
          title="No decisions recorded yet"
          description="Record them in the Decisions section of the Overview tab and they will be listed here."
        />
      ) : (
        <ul className="flex flex-col gap-1 text-sm">
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
      )}
    </ReadOnlySection>
  );
}

export function AgendaCreatedActionItems({
  items,
  onViewAll,
}: {
  items: ActionItem[];
  onViewAll: () => void;
}) {
  return (
    <ReadOnlySection title="Action items created today" onViewAll={onViewAll}>
      {items.length === 0 ? (
        <p className="app-muted text-sm">None yet.</p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm">
          {items.map((item) => (
            <li key={item.id}>
              {item.description}
              <span className="app-muted">
                {" "}
                — {personDisplayName(item.owner)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </ReadOnlySection>
  );
}
