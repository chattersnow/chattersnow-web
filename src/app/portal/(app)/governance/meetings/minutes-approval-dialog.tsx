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

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeZone: "UTC",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDate(value: string) {
  return dateFormatter.format(new Date(value));
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
        setError(result.error);
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
            className="inline-flex items-center gap-1.5 text-left underline decoration-dotted underline-offset-2 hover:text-foreground"
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
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Previous meeting minutes</DialogTitle>
          <DialogDescription>
            {formatDate(previousMeeting.meetingDate)} — review before approving.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 text-sm">
          <div>
            <p className="app-muted text-xs font-semibold uppercase tracking-[0.1em]">
              Meeting notes
            </p>
            <p className="mt-1 whitespace-pre-wrap">
              {previousMeeting.bodyText || "—"}
            </p>
          </div>

          <div>
            <p className="app-muted text-xs font-semibold uppercase tracking-[0.1em]">
              Decisions & votes
            </p>
            {previousMeeting.decisions.length === 0 ? (
              <p className="app-muted mt-1">No decisions recorded.</p>
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
            <p className="app-muted text-xs font-semibold uppercase tracking-[0.1em]">
              Action items
            </p>
            {previousMeeting.actionItems.length === 0 ? (
              <p className="app-muted mt-1">No action items recorded.</p>
            ) : (
              <ul className="mt-1 flex flex-col gap-1">
                {previousMeeting.actionItems.map((item) => (
                  <li key={item.id}>
                    {item.description}
                    <span className="app-muted">
                      {" "}
                      — {item.owner?.name ?? "—"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {approvedAt && (
            <p className="app-muted text-xs">
              Approved {dateTimeFormatter.format(new Date(approvedAt))}
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
