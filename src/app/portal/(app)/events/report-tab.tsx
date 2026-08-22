"use client";

import { FormEvent, Ref, useEffect, useImperativeHandle, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitEventReportAction, updateEventReportAction } from "./actions";
import { ReportStatusBadge, type EventRow } from "./event-badges";
import { ReadOnlyField } from "@/components/ui/read-only-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";

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
  return (Object.keys(baseline) as (keyof FormState)[]).some((key) => form[key] !== baseline[key]);
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
      const result = await updateEventReportAction(event.id, formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.refresh();
      onSaved();
    });
  }

  function handleSubmitReport() {
    setError(null);
    startSubmitTransition(async () => {
      const result = await submitEventReportAction(event.id);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  if (mode === "view") {
    return (
      <FieldGroup>
        <Field>
          <FieldLabel>Report status</FieldLabel>
          <div>
            <ReportStatusBadge status={event.report_status} />
          </div>
        </Field>
        <ReadOnlyField label="Report summary" htmlFor="report-reportSummary">
          {form.reportSummary || "—"}
        </ReadOnlyField>
        <ReadOnlyField label="Participant feedback" htmlFor="report-feedbackNotes">
          {form.feedbackNotes || "—"}
        </ReadOnlyField>
        <ReadOnlyField label="Photos / content" htmlFor="report-contentNotes">
          {form.contentNotes || "—"}
        </ReadOnlyField>
        <ReadOnlyField label="Lessons learned" htmlFor="report-lessonsLearned">
          {form.lessonsLearned || "—"}
        </ReadOnlyField>
        {event.report_status !== "submitted" && (
          <Button type="button" variant="outline" className="self-start" onClick={handleSubmitReport} disabled={isSubmitting}>
            {isSubmitting ? "Submitting..." : "Submit report"}
          </Button>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </FieldGroup>
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
            onChange={(changeEvent) => update("reportSummary", changeEvent.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="report-feedbackNotes">Participant feedback</FieldLabel>
          <Textarea
            id="report-feedbackNotes"
            value={form.feedbackNotes}
            onChange={(changeEvent) => update("feedbackNotes", changeEvent.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="report-contentNotes">Photos / content</FieldLabel>
          <Textarea
            id="report-contentNotes"
            placeholder="Links to shared albums, social posts, etc."
            value={form.contentNotes}
            onChange={(changeEvent) => update("contentNotes", changeEvent.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="report-lessonsLearned">Lessons learned</FieldLabel>
          <Textarea
            id="report-lessonsLearned"
            value={form.lessonsLearned}
            onChange={(changeEvent) => update("lessonsLearned", changeEvent.target.value)}
          />
        </Field>

        {event.report_status !== "submitted" && (
          <Button type="button" variant="outline" className="self-start" onClick={handleSubmitReport} disabled={isSubmitting}>
            {isSubmitting ? "Submitting..." : "Submit report"}
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
