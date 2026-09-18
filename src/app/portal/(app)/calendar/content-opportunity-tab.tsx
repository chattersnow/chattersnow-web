"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import {
  createContentOpportunityAction,
  updateContentOpportunityAction,
} from "./content-opportunity-actions";
import {
  CONTENT_STATUSES,
  leadTimeSchedule,
  type ContentOpportunityRow,
} from "./content-opportunity-shared";
import { ContentStatusBadge } from "./content-opportunity-badges";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ReadOnlyField } from "@/components/ui/read-only-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { calendarActorName, ownerName, ownerOptions } from "./calendar-shared";
import type { CalendarOwner } from "./calendar-shared";
import { PersonSelect } from "../people/person-select";
import { Spinner } from "@/components/ui/spinner";
import { formatDateTime } from "@/lib/format";
import { utcIsoToDatetimeLocalInBrowser } from "@/lib/time";
import { EmptyState } from "@/components/portal/empty-state";
import { runAction } from "@/components/portal/action-toast";
import { RequiredFieldsNote } from "@/components/required-fields-note";

function formStateFor(
  opportunity: ContentOpportunityRow | null,
  defaultLeadTimeDays: number,
  itemStartsAt: string,
) {
  return {
    contentStatus: opportunity?.content_status ?? "not_planned",
    skipReason: opportunity?.skip_reason ?? "",
    orgConnection: opportunity?.org_connection ?? "",
    recommendedFormats: opportunity?.recommended_formats ?? "",
    recommendedAction: opportunity?.recommended_action ?? "",
    outstandingWork: opportunity?.outstanding_work ?? "",
    internalNotes: opportunity?.internal_notes ?? "",
    ownerId: opportunity?.owner_id ?? "",
    reviewerId: opportunity?.reviewer_id ?? "",
    leadTimeDays: String(opportunity?.lead_time_days ?? defaultLeadTimeDays),
    publishDueAt: utcIsoToDatetimeLocalInBrowser(
      opportunity?.publish_due_at ?? itemStartsAt,
    ),
    reviewDueAt: utcIsoToDatetimeLocalInBrowser(
      opportunity?.review_due_at ?? null,
    ),
    draftDueAt: utcIsoToDatetimeLocalInBrowser(
      opportunity?.draft_due_at ?? null,
    ),
  };
}

type FormState = ReturnType<typeof formStateFor>;

export function ContentOpportunityTab({
  calendarItemId,
  itemStartsAt,
  opportunity,
  owners,
  defaultLeadTimeDays,
  canManage,
  isSensitiveTopic,
  toneGuidance,
}: {
  calendarItemId: string;
  itemStartsAt: string;
  opportunity: ContentOpportunityRow | null;
  owners: CalendarOwner[];
  defaultLeadTimeDays: number;
  canManage: boolean;
  isSensitiveTopic: boolean;
  toneGuidance: string | null;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [form, setForm] = useState<FormState>(() =>
    formStateFor(opportunity, defaultLeadTimeDays, itemStartsAt),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function startEditing() {
    setForm(formStateFor(opportunity, defaultLeadTimeDays, itemStartsAt));
    setError(null);
    setMode("edit");
  }

  function applyLeadTimeDefaults() {
    if (!form.publishDueAt) {
      setError("Set a publish due date before applying lead-time defaults.");
      return;
    }
    const leadTimeDays = Number(form.leadTimeDays);
    if (!Number.isInteger(leadTimeDays) || leadTimeDays <= 0) {
      setError("Set a valid lead time before applying defaults.");
      return;
    }
    const { draftDueAt, reviewDueAt } = leadTimeSchedule(
      new Date(form.publishDueAt),
      leadTimeDays,
    );
    setError(null);
    setForm((prev) => ({
      ...prev,
      draftDueAt: utcIsoToDatetimeLocalInBrowser(draftDueAt.toISOString()),
      reviewDueAt: utcIsoToDatetimeLocalInBrowser(reviewDueAt.toISOString()),
    }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("contentStatus", form.contentStatus);
    formData.set("skipReason", form.skipReason);
    formData.set("orgConnection", form.orgConnection);
    formData.set("recommendedFormats", form.recommendedFormats);
    formData.set("recommendedAction", form.recommendedAction);
    formData.set("outstandingWork", form.outstandingWork);
    formData.set("internalNotes", form.internalNotes);
    formData.set("ownerId", form.ownerId);
    formData.set("reviewerId", form.reviewerId);
    formData.set("leadTimeDays", form.leadTimeDays);
    // Converted here, in the browser, so each due instant is fixed using the
    // user's own timezone rather than the server's.
    formData.set(
      "publishDueAt",
      form.publishDueAt ? new Date(form.publishDueAt).toISOString() : "",
    );
    formData.set(
      "reviewDueAt",
      form.reviewDueAt ? new Date(form.reviewDueAt).toISOString() : "",
    );
    formData.set(
      "draftDueAt",
      form.draftDueAt ? new Date(form.draftDueAt).toISOString() : "",
    );

    startTransition(async () => {
      await runAction(
        () =>
          opportunity
            ? updateContentOpportunityAction(opportunity.id, formData)
            : createContentOpportunityAction(calendarItemId, formData),
        {
          success: opportunity
            ? "Content brief saved."
            : "Content brief created.",
          onError: setError,
          onSuccess: () => {
            setMode("view");
            router.refresh();
          },
        },
      );
    });
  }

  const toneGuidanceBanner = isSensitiveTopic && (
    <Alert>
      <AlertDescription>
        <strong>Sensitive topic.</strong>{" "}
        {toneGuidance ??
          "Add tone guidance on this item's Details tab so it's surfaced here for whoever writes this content."}
      </AlertDescription>
    </Alert>
  );

  if (!opportunity && mode === "view") {
    return (
      <div className="flex flex-col gap-3 py-2">
        {toneGuidanceBanner}
        <EmptyState
          className="py-4"
          title="No content brief yet for this item"
          description={
            canManage
              ? "Start one to capture the angle, owner, and deadlines for this piece."
              : "A brief appears here once a content manager starts one."
          }
          action={
            canManage ? (
              <Button type="button" variant="secondary" onClick={startEditing}>
                Start content brief
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 py-2">
      {toneGuidanceBanner}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {mode === "view" && opportunity ? (
        <FieldGroup>
          <div className="flex items-center justify-between">
            <ContentStatusBadge status={opportunity.content_status} />
            {canManage && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Edit content brief"
                onClick={startEditing}
              >
                <Pencil />
              </Button>
            )}
          </div>
          {opportunity.content_status === "skipped" &&
            opportunity.skip_reason && (
              <ReadOnlyField label="Skip reason" htmlFor="brief-skip-reason">
                {opportunity.skip_reason}
              </ReadOnlyField>
            )}
          <ReadOnlyField label="Our connection" htmlFor="brief-connection">
            {opportunity.org_connection || "—"}
          </ReadOnlyField>
          <Field orientation="responsive">
            <ReadOnlyField
              label="Recommended formats/channels"
              htmlFor="brief-formats"
            >
              {opportunity.recommended_formats || "—"}
            </ReadOnlyField>
            <ReadOnlyField
              label="Recommended action / CTA"
              htmlFor="brief-action"
            >
              {opportunity.recommended_action || "—"}
            </ReadOnlyField>
          </Field>
          <Field orientation="responsive">
            <ReadOnlyField label="Owner" htmlFor="brief-owner">
              {ownerName(owners, opportunity.owner_id)}
            </ReadOnlyField>
            <ReadOnlyField label="Reviewer" htmlFor="brief-reviewer">
              {ownerName(owners, opportunity.reviewer_id)}
            </ReadOnlyField>
          </Field>
          <Field orientation="responsive">
            <ReadOnlyField label="Draft due" htmlFor="brief-draft-due">
              {formatDateTime(opportunity.draft_due_at)}
            </ReadOnlyField>
            <ReadOnlyField label="Review due" htmlFor="brief-review-due">
              {formatDateTime(opportunity.review_due_at)}
            </ReadOnlyField>
            <ReadOnlyField label="Publish due" htmlFor="brief-publish-due">
              {formatDateTime(opportunity.publish_due_at)}
            </ReadOnlyField>
          </Field>
          <ReadOnlyField label="Lead time" htmlFor="brief-lead-time">
            {opportunity.lead_time_days} days
          </ReadOnlyField>
          <ReadOnlyField label="Outstanding work" htmlFor="brief-outstanding">
            {opportunity.outstanding_work || "—"}
          </ReadOnlyField>
          <Field>
            <ReadOnlyField
              label="Internal notes"
              htmlFor="brief-internal-notes"
            >
              {opportunity.internal_notes || "—"}
            </ReadOnlyField>
            <FieldDescription>
              Staff-only working notes. Never record specific personal, medical,
              legal, or confidential case details here.
            </FieldDescription>
          </Field>
          {opportunity.status_changed_at && (
            <p className="app-muted text-xs">
              Status last changed{" "}
              {formatDateTime(opportunity.status_changed_at)} by{" "}
              {calendarActorName(
                owners,
                opportunity.status_changed_by,
                "someone no longer listed",
              )}
            </p>
          )}
        </FieldGroup>
      ) : (
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field orientation="responsive">
              <Field>
                <FieldLabel htmlFor="brief-contentStatus">
                  Content status
                </FieldLabel>
                <Select
                  value={form.contentStatus}
                  onValueChange={(value) =>
                    update("contentStatus", value ?? "not_planned")
                  }
                >
                  <SelectTrigger id="brief-contentStatus" className="w-full">
                    <SelectValue placeholder="Select status">
                      {(value: string) =>
                        CONTENT_STATUSES.find(
                          (option) => option.value === value,
                        )?.label
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {CONTENT_STATUSES.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="brief-skipReason">Skip reason</FieldLabel>
                <Input
                  id="brief-skipReason"
                  placeholder={
                    form.contentStatus === "skipped"
                      ? "Reason (required)"
                      : "Only used when skipped"
                  }
                  value={form.skipReason}
                  onChange={(event) => update("skipReason", event.target.value)}
                />
              </Field>
            </Field>

            <Field>
              <FieldLabel htmlFor="brief-orgConnection">
                Our connection
              </FieldLabel>
              <Textarea
                id="brief-orgConnection"
                placeholder="Why does this matter to your organization?"
                value={form.orgConnection}
                onChange={(event) =>
                  update("orgConnection", event.target.value)
                }
              />
            </Field>

            <Field orientation="responsive">
              <Field>
                <FieldLabel htmlFor="brief-recommendedFormats">
                  Recommended formats/channels
                </FieldLabel>
                <Input
                  id="brief-recommendedFormats"
                  placeholder="e.g. Instagram carousel, website post"
                  value={form.recommendedFormats}
                  onChange={(event) =>
                    update("recommendedFormats", event.target.value)
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="brief-recommendedAction">
                  Recommended action / CTA
                </FieldLabel>
                <Input
                  id="brief-recommendedAction"
                  value={form.recommendedAction}
                  onChange={(event) =>
                    update("recommendedAction", event.target.value)
                  }
                />
              </Field>
            </Field>

            <Field orientation="responsive">
              <Field>
                <FieldLabel htmlFor="brief-ownerId">Owner</FieldLabel>
                <PersonSelect
                  id="brief-ownerId"
                  people={ownerOptions(owners)}
                  value={form.ownerId || null}
                  onChange={(personId) => update("ownerId", personId ?? "")}
                  noneLabel="No owner"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="brief-reviewerId">Reviewer</FieldLabel>
                <PersonSelect
                  id="brief-reviewerId"
                  people={ownerOptions(owners)}
                  value={form.reviewerId || null}
                  onChange={(personId) => update("reviewerId", personId ?? "")}
                  noneLabel="No reviewer"
                />
              </Field>
            </Field>

            <Field orientation="responsive">
              <Field>
                <FieldLabel htmlFor="brief-leadTimeDays">
                  Lead time (days)
                </FieldLabel>
                <Input
                  id="brief-leadTimeDays"
                  type="number"
                  min={1}
                  step={1}
                  value={form.leadTimeDays}
                  onChange={(event) =>
                    update("leadTimeDays", event.target.value)
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="brief-publishDueAt">
                  Publish due
                </FieldLabel>
                <Input
                  id="brief-publishDueAt"
                  type="datetime-local"
                  value={form.publishDueAt}
                  onChange={(event) =>
                    update("publishDueAt", event.target.value)
                  }
                />
              </Field>
            </Field>

            <div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={applyLeadTimeDefaults}
              >
                Apply lead-time defaults
              </Button>
            </div>

            <Field orientation="responsive">
              <Field>
                <FieldLabel htmlFor="brief-draftDueAt">Draft due</FieldLabel>
                <Input
                  id="brief-draftDueAt"
                  type="datetime-local"
                  value={form.draftDueAt}
                  onChange={(event) => update("draftDueAt", event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="brief-reviewDueAt">Review due</FieldLabel>
                <Input
                  id="brief-reviewDueAt"
                  type="datetime-local"
                  value={form.reviewDueAt}
                  onChange={(event) =>
                    update("reviewDueAt", event.target.value)
                  }
                />
              </Field>
            </Field>

            <Field>
              <FieldLabel htmlFor="brief-outstandingWork">
                Outstanding work
              </FieldLabel>
              <Textarea
                id="brief-outstandingWork"
                value={form.outstandingWork}
                onChange={(event) =>
                  update("outstandingWork", event.target.value)
                }
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="brief-internalNotes">
                Internal notes
              </FieldLabel>
              <Textarea
                id="brief-internalNotes"
                value={form.internalNotes}
                onChange={(event) =>
                  update("internalNotes", event.target.value)
                }
              />
              <FieldDescription>
                Staff-only working notes. Never record specific personal,
                medical, legal, or confidential case details here.
              </FieldDescription>
            </Field>
          </FieldGroup>

          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setMode("view")}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <>
                  <Spinner /> Saving...
                </>
              ) : (
                "Save brief"
              )}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
