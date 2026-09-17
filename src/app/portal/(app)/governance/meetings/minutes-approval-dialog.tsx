"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  approveMinutesAction,
  type PreviousMeetingMinutes,
} from "./minutes-approval-actions";
import {
  formatDateTime,
  formatInstantDate,
  personDisplayName,
} from "@/lib/format";
import { EmptyState } from "@/components/portal/empty-state";
import { MarkdownText } from "@/components/portal/markdown-text";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="app-muted text-xs font-semibold tracking-[0.1em] uppercase">
      {children}
    </p>
  );
}

/**
 * The record itself: the walked snapshot when there is one, the agenda's notes
 * when there is not.
 *
 * Until #1201 this was one `whitespace-pre-wrap` blob of the *agenda's*
 * body_text in either case, which is what the board was approving. A set of
 * minutes has structure -- the frozen agenda items, each with what was said
 * under it -- and a reviewer should see it the way the notetaker wrote it.
 */
function PreviousMinutesBody({
  previousMeeting,
}: {
  previousMeeting: PreviousMeetingMinutes;
}) {
  if (previousMeeting.source === "agenda_notes") {
    return (
      <div>
        <SectionLabel>Minutes</SectionLabel>
        <p className="app-muted mt-1 text-xs">
          No minutes were recorded for that meeting, so this is its
          agenda&apos;s notes.
        </p>
        <p className="mt-1 whitespace-pre-wrap">
          {previousMeeting.bodyText || "—"}
        </p>
      </div>
    );
  }

  const items = previousMeeting.snapshot?.items ?? [];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionLabel>Minutes</SectionLabel>
        <Badge
          variant={previousMeeting.status === "final" ? "success" : "progress"}
        >
          {previousMeeting.status === "final" ? "Final" : "Draft"}
        </Badge>
      </div>

      {items.length === 0 ? (
        <p className="app-muted mt-1">No agenda was frozen into them.</p>
      ) : (
        <ul className="mt-1 flex flex-col gap-2">
          {items.map((item) => {
            const note = previousMeeting.notes[item.key]?.trim() ?? "";
            return (
              <li key={item.key}>
                <p className="font-medium">{item.label}</p>
                {note === "" ? (
                  <p className="app-muted">No notes recorded.</p>
                ) : (
                  <MarkdownText>{note}</MarkdownText>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-3 font-medium">Closing notes</p>
      {previousMeeting.bodyText?.trim() ? (
        <MarkdownText>{previousMeeting.bodyText}</MarkdownText>
      ) : (
        <p className="app-muted">None.</p>
      )}
    </div>
  );
}

export function MinutesApprovalDialog({
  meetingId,
  previousMeeting,
  approvedAt,
  canApprove,
  onApproved,
}: {
  meetingId: string;
  previousMeeting: PreviousMeetingMinutes;
  approvedAt: string | null;
  canApprove: boolean;
  onApproved: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleApprove() {
    setError(null);
    startTransition(async () => {
      const result = await approveMinutesAction(meetingId);
      if ("error" in result) {
        // The #1082 envelope: `message` is the display copy, written for the
        // person in the room rather than for a log.
        setError(result.error.message);
        return;
      }
      onApproved();
    });
  }

  return (
    <Dialog>
      <DialogTrigger
        render={
          <button
            type="button"
            className="hover:text-foreground inline-flex items-center gap-1.5 text-left underline decoration-dotted underline-offset-2"
          />
        }
      >
        Approve previous meeting minutes
        {approvedAt && (
          <Badge variant="secondary" className="align-middle">
            <Check /> Approved
          </Badge>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Previous meeting minutes</DialogTitle>
          <DialogDescription>
            {formatInstantDate(previousMeeting.meetingDate)} — review before
            approving.
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[55vh] flex-col gap-4 overflow-y-auto text-sm">
          <PreviousMinutesBody previousMeeting={previousMeeting} />

          <div>
            <SectionLabel>Decisions &amp; votes</SectionLabel>
            {previousMeeting.decisions.length === 0 ? (
              <EmptyState
                className="py-4"
                title="No decisions recorded"
                description="That meeting has nothing in its Decisions section."
              />
            ) : (
              <ul className="mt-1 flex flex-col gap-1">
                {previousMeeting.decisions.map((decision) => (
                  <li key={decision.id}>
                    {decision.topic && (
                      <span className="font-medium">{decision.topic}: </span>
                    )}
                    {decision.description}
                    {decision.vote_result && (
                      <span className="app-muted">
                        {" "}
                        ({decision.vote_result})
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <SectionLabel>Action items</SectionLabel>
            {previousMeeting.actionItems.length === 0 ? (
              <EmptyState
                className="py-4"
                title="No action items recorded"
                description="That meeting has nothing in its Action Items section."
              />
            ) : (
              <ul className="mt-1 flex flex-col gap-1">
                {previousMeeting.actionItems.map((item) => (
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
          </div>

          {approvedAt && (
            <p className="app-muted text-xs">
              Approved {formatDateTime(approvedAt)}
            </p>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter showCloseButton>
          {canApprove && !approvedAt && (
            <Button type="button" onClick={handleApprove} disabled={isPending}>
              {isPending ? (
                <>
                  <Spinner /> Approving...
                </>
              ) : (
                "Mark approved"
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
