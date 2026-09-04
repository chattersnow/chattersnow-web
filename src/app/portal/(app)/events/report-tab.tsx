"use client";

import {
  FormEvent,
  Ref,
  useEffect,
  useImperativeHandle,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import {
  getCanReopenEventReportAction,
  reopenEventReportAction,
  submitEventReportAction,
  updateEventReportAction,
} from "./actions";
import { ReportStatusBadge, type EventRow } from "./event-badges";
import { ReadOnlyField } from "@/components/ui/read-only-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { useTabData } from "@/hooks/use-tab-data";
import { runAction } from "@/components/portal/action-toast";

function formStateFor(event: EventRow) {
  return {
    feedbackNotes: event.feedback_notes ?? "",
    contentNotes: event.content_notes ?? "",
    lessonsLearned: event.lessons_learned ?? "",
    reportSummary: event.report_summary ?? "",
  };
}

type FormState = ReturnType<typeof formStateFor>;

function isDirty(form: FormState, event: EventRow) {
  const baseline = formStateFor(event);
  return (Object.keys(baseline) as (keyof FormState)[]).some(
    (key) => form[key] !== baseline[key],
  );
}

export type ReportTabHandle = {
  discard: () => void;
};

export function ReportTab({
  event,
  formId,
  mode,
  onSaved,
  onPendingChange,
  onDirtyChange,
  ref,
}: {
  event: EventRow;
  formId: string;
  mode: "view" | "edit";
  onSaved: () => void;
  onPendingChange?: (pending: boolean) => void;
  onDirtyChange?: (dirty: boolean) => void;
  ref?: Ref<ReportTabHandle>;
}) {
  const router = useRouter();
  const [form, setForm] = useState(() => formStateFor(event));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isSubmitting, startSubmitTransition] = useTransition();
  const locked = event.report_status === "submitted";
  // Only a submitted report can be reopened, so don't probe the permission
  // until it is -- this is a real gate, not a "is my tab on screen" one.
  const { data: reopenContext } = useTabData<{ canReopen: boolean }>(
    () => getCanReopenEventReportAction(),
    [locked],
    locked,
  );
  const canReopen = reopenContext?.canReopen ?? false;
  const [reopenDialogOpen, setReopenDialogOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const [isReopening, startReopenTransition] = useTransition();

  useEffect(() => {
    onPendingChange?.(isPending);
  }, [isPending, onPendingChange]);

  useEffect(() => {
    onDirtyChange?.(isDirty(form, event));
  }, [form, event, onDirtyChange]);

  useImperativeHandle(ref, () => ({
    discard: () => {
      setError(null);
      setForm(formStateFor(event));
    },
  }));

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("feedbackNotes", form.feedbackNotes);
    formData.set("contentNotes", form.contentNotes);
    formData.set("lessonsLearned", form.lessonsLearned);
    formData.set("reportSummary", form.reportSummary);

    startTransition(async () => {
      await runAction(() => updateEventReportAction(event.id, formData), {
        success: "Event report saved.",
        onError: setError,
        onSuccess: () => {
          router.refresh();
          onSaved();
        },
      });
    });
  }

  function handleSubmitReport() {
    setError(null);
    startSubmitTransition(async () => {
      await runAction(() => submitEventReportAction(event.id), {
        success: "Event report submitted.",
        onError: setError,
        onSuccess: () => router.refresh(),
      });
    });
  }

  function handleReopen(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    setError(null);
    startReopenTransition(async () => {
      await runAction(() => reopenEventReportAction(event.id, reopenReason), {
        success: "Event report reopened.",
        onError: setError,
        onSuccess: () => {
          setReopenDialogOpen(false);
          setReopenReason("");
          router.refresh();
        },
      });
    });
  }

  if (mode === "view" || locked) {
    return (
      <>
        <FieldGroup>
          <Field>
            <FieldLabel>Report status</FieldLabel>
            <div className="flex items-center gap-2">
              <ReportStatusBadge status={event.report_status} />
              {locked && canReopen && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setReopenDialogOpen(true)}
                >
                  Reopen report
                </Button>
              )}
            </div>
          </Field>
          <ReadOnlyField label="Report summary" htmlFor="report-reportSummary">
            {form.reportSummary || "—"}
          </ReadOnlyField>
          <ReadOnlyField
            label="Participant feedback"
            htmlFor="report-feedbackNotes"
          >
            {form.feedbackNotes || "—"}
          </ReadOnlyField>
          <ReadOnlyField label="Photos / content" htmlFor="report-contentNotes">
            {form.contentNotes || "—"}
          </ReadOnlyField>
          <ReadOnlyField
            label="Lessons learned"
            htmlFor="report-lessonsLearned"
          >
            {form.lessonsLearned || "—"}
          </ReadOnlyField>
          {event.report_status !== "submitted" && (
            <Button
              type="button"
              variant="secondary"
              className="self-start"
              onClick={handleSubmitReport}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Spinner /> Submitting...
                </>
              ) : (
                "Submit report"
              )}
            </Button>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </FieldGroup>

        <Dialog
          open={reopenDialogOpen}
          onOpenChange={(next) => {
            setReopenDialogOpen(next);
            if (!next) setReopenReason("");
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Reopen report</DialogTitle>
              <DialogDescription>
                Explain why this submitted report is being reopened. Overview,
                Planning, and Report will become editable again.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleReopen}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="reopen-report-reason">Reason</FieldLabel>
                  <Textarea
                    id="reopen-report-reason"
                    required
                    value={reopenReason}
                    onChange={(event) => setReopenReason(event.target.value)}
                  />
                </Field>
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
              </FieldGroup>
              <DialogFooter>
                <Button type="submit" disabled={isReopening}>
                  {isReopening ? (
                    <>
                      <Spinner /> Reopening...
                    </>
                  ) : (
                    "Reopen report"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <form id={formId} onSubmit={handleSubmit}>
      <FieldGroup>
        <Field>
          <FieldLabel>Report status</FieldLabel>
          <div>
            <ReportStatusBadge status={event.report_status} />
          </div>
        </Field>

        <Field>
          <FieldLabel htmlFor="report-reportSummary">Report summary</FieldLabel>
          <Textarea
            id="report-reportSummary"
            placeholder="Write-up of how the event went, pulling together attendance, expenses, incidents, etc."
            value={form.reportSummary}
            onChange={(changeEvent) =>
              update("reportSummary", changeEvent.target.value)
            }
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="report-feedbackNotes">
            Participant feedback
          </FieldLabel>
          <Textarea
            id="report-feedbackNotes"
            value={form.feedbackNotes}
            onChange={(changeEvent) =>
              update("feedbackNotes", changeEvent.target.value)
            }
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="report-contentNotes">
            Photos / content
          </FieldLabel>
          <Textarea
            id="report-contentNotes"
            placeholder="Links to shared albums, social posts, etc."
            value={form.contentNotes}
            onChange={(changeEvent) =>
              update("contentNotes", changeEvent.target.value)
            }
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="report-lessonsLearned">
            Lessons learned
          </FieldLabel>
          <Textarea
            id="report-lessonsLearned"
            value={form.lessonsLearned}
            onChange={(changeEvent) =>
              update("lessonsLearned", changeEvent.target.value)
            }
          />
        </Field>

        {event.report_status !== "submitted" && (
          <Button
            type="button"
            variant="secondary"
            className="self-start"
            onClick={handleSubmitReport}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Spinner /> Submitting...
              </>
            ) : (
              "Submit report"
            )}
          </Button>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </FieldGroup>
    </form>
  );
}
