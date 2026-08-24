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
import type { CalendarOwner } from "./calendar-shared";
import type {
  ActiveContentBriefTemplate,
  TemplateField,
} from "./content-brief-template-shared";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

function toDatetimeLocalValue(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function formStateFor(
  opportunity: ContentOpportunityRow | null,
  defaultLeadTimeDays: number,
  itemStartsAt: string,
) {
  return {
    contentStatus: opportunity?.content_status ?? "not_planned",
    skipReason: opportunity?.skip_reason ?? "",
    chatterConnection: opportunity?.chatter_connection ?? "",
    recommendedFormats: opportunity?.recommended_formats ?? "",
    recommendedAction: opportunity?.recommended_action ?? "",
    outstandingWork: opportunity?.outstanding_work ?? "",
    ownerId: opportunity?.owner_id ?? "",
    reviewerId: opportunity?.reviewer_id ?? "",
    leadTimeDays: String(opportunity?.lead_time_days ?? defaultLeadTimeDays),
    publishDueAt: toDatetimeLocalValue(
      opportunity?.publish_due_at ?? itemStartsAt,
    ),
    reviewDueAt: toDatetimeLocalValue(opportunity?.review_due_at ?? null),
    draftDueAt: toDatetimeLocalValue(opportunity?.draft_due_at ?? null),
    // Seeded from the brief's OWN pinned version's fields, never the
    // template's current/live version -- so opening an existing brief for
    // edit never silently upgrades its structure. Only picking a template
    // from the dropdown below changes templateVersionId/resolvedFields.
    templateId: opportunity?.template_id ?? "",
    templateVersionId: opportunity?.template_version_id ?? "",
    templateFieldValues: opportunity?.template_field_values ?? {},
    resolvedFields: opportunity?.template_version?.fields ?? [],
  };
}

type FormState = ReturnType<typeof formStateFor>;

export function ContentOpportunityTab({
  calendarItemId,
  itemStartsAt,
  opportunity,
  owners,
  activeTemplates,
  defaultLeadTimeDays,
  canManage,
}: {
  calendarItemId: string;
  itemStartsAt: string;
  opportunity: ContentOpportunityRow | null;
  owners: CalendarOwner[];
  activeTemplates: ActiveContentBriefTemplate[];
  defaultLeadTimeDays: number;
  canManage: boolean;
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
      draftDueAt: toDatetimeLocalValue(draftDueAt.toISOString()),
      reviewDueAt: toDatetimeLocalValue(reviewDueAt.toISOString()),
    }));
  }

  function selectTemplate(value: string) {
    if (value === "none") {
      setForm((prev) => ({
        ...prev,
        templateId: "",
        templateVersionId: "",
        templateFieldValues: {},
        resolvedFields: [],
      }));
      return;
    }
    const match = activeTemplates.find((template) => template.id === value);
    if (!match) return;
    // Picks the template's CURRENT version, frozen at this moment. Switching
    // templates (or re-picking the same one after it's been revised) resets
    // field values -- the new field list may not share the old one's keys.
    setForm((prev) => ({
      ...prev,
      templateId: match.id,
      templateVersionId: match.version_id,
      templateFieldValues: {},
      resolvedFields: match.fields,
    }));
  }

  function updateTemplateFieldValue(key: string, value: string) {
    setForm((prev) => ({
      ...prev,
      templateFieldValues: { ...prev.templateFieldValues, [key]: value },
    }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("contentStatus", form.contentStatus);
    formData.set("skipReason", form.skipReason);
    formData.set("chatterConnection", form.chatterConnection);
    formData.set("recommendedFormats", form.recommendedFormats);
    formData.set("recommendedAction", form.recommendedAction);
    formData.set("outstandingWork", form.outstandingWork);
    formData.set("ownerId", form.ownerId);
    formData.set("reviewerId", form.reviewerId);
    formData.set("leadTimeDays", form.leadTimeDays);
    formData.set("publishDueAt", form.publishDueAt);
    formData.set("reviewDueAt", form.reviewDueAt);
    formData.set("draftDueAt", form.draftDueAt);
    formData.set("templateId", form.templateId);
    formData.set("templateVersionId", form.templateVersionId);
    formData.set(
      "templateFieldValues",
      JSON.stringify(form.templateFieldValues),
    );

    startTransition(async () => {
      const result = opportunity
        ? await updateContentOpportunityAction(opportunity.id, formData)
        : await createContentOpportunityAction(calendarItemId, formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setMode("view");
      router.refresh();
    });
  }

  if (!opportunity && mode === "view") {
    return (
      <div className="flex flex-col items-start gap-3 py-2">
        <p className="app-muted text-sm">No content brief yet for this item.</p>
        {canManage && (
          <Button type="button" variant="outline" onClick={startEditing}>
            Start content brief
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 py-2">
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
          {opportunity.template_version && (
            <>
              <ReadOnlyField label="Template" htmlFor="brief-template">
                {activeTemplates.find(
                  (template) => template.id === opportunity.template_id,
                )?.name ?? "Template"}{" "}
                (v{opportunity.template_version.version})
              </ReadOnlyField>
              {opportunity.template_version.fields.map((field) => (
                <ReadOnlyField
                  key={field.key}
                  label={field.label}
                  htmlFor={`brief-template-field-${field.key}`}
                >
                  {opportunity.template_field_values[field.key] || "—"}
                </ReadOnlyField>
              ))}
            </>
          )}
          <ReadOnlyField label="Chatter connection" htmlFor="brief-connection">
            {opportunity.chatter_connection || "—"}
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
              {owners.find((owner) => owner.user_id === opportunity.owner_id)
                ?.email ?? "—"}
            </ReadOnlyField>
            <ReadOnlyField label="Reviewer" htmlFor="brief-reviewer">
              {owners.find((owner) => owner.user_id === opportunity.reviewer_id)
                ?.email ?? "—"}
            </ReadOnlyField>
          </Field>
          <Field orientation="responsive">
            <ReadOnlyField label="Draft due" htmlFor="brief-draft-due">
              {opportunity.draft_due_at
                ? dateFormatter.format(new Date(opportunity.draft_due_at))
                : "—"}
            </ReadOnlyField>
            <ReadOnlyField label="Review due" htmlFor="brief-review-due">
              {opportunity.review_due_at
                ? dateFormatter.format(new Date(opportunity.review_due_at))
                : "—"}
            </ReadOnlyField>
            <ReadOnlyField label="Publish due" htmlFor="brief-publish-due">
              {opportunity.publish_due_at
                ? dateFormatter.format(new Date(opportunity.publish_due_at))
                : "—"}
            </ReadOnlyField>
          </Field>
          <ReadOnlyField label="Lead time" htmlFor="brief-lead-time">
            {opportunity.lead_time_days} days
          </ReadOnlyField>
          <ReadOnlyField label="Outstanding work" htmlFor="brief-outstanding">
            {opportunity.outstanding_work || "—"}
          </ReadOnlyField>
          {opportunity.status_changed_at && (
            <p className="app-muted text-xs">
              Status last changed{" "}
              {dateFormatter.format(new Date(opportunity.status_changed_at))} by{" "}
              {owners.find(
                (owner) => owner.user_id === opportunity.status_changed_by,
              )?.email ?? "someone no longer listed"}
            </p>
          )}
        </FieldGroup>
      ) : (
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="brief-template">
                Content brief template
              </FieldLabel>
              <Select
                value={form.templateId || "none"}
                onValueChange={(value) => selectTemplate(value ?? "none")}
              >
                <SelectTrigger id="brief-template" className="w-full">
                  <SelectValue placeholder="No template">
                    {(value: string) =>
                      value && value !== "none"
                        ? (activeTemplates.find(
                            (template) => template.id === value,
                          )?.name ?? "No template")
                        : "No template"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No template</SelectItem>
                  {activeTemplates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {form.resolvedFields.map((field: TemplateField) => (
              <Field key={field.key}>
                <FieldLabel htmlFor={`brief-template-field-${field.key}`}>
                  {field.label}
                </FieldLabel>
                <Textarea
                  id={`brief-template-field-${field.key}`}
                  value={form.templateFieldValues[field.key] ?? ""}
                  onChange={(event) =>
                    updateTemplateFieldValue(field.key, event.target.value)
                  }
                />
                {field.help_text && (
                  <FieldDescription>{field.help_text}</FieldDescription>
                )}
              </Field>
            ))}

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
              <FieldLabel htmlFor="brief-chatterConnection">
                Chatter connection
              </FieldLabel>
              <Textarea
                id="brief-chatterConnection"
                placeholder="What's the specific Chatter connection?"
                value={form.chatterConnection}
                onChange={(event) =>
                  update("chatterConnection", event.target.value)
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
                <Select
                  value={form.ownerId || "none"}
                  onValueChange={(value) =>
                    update("ownerId", value === "none" ? "" : (value ?? ""))
                  }
                >
                  <SelectTrigger id="brief-ownerId" className="w-full">
                    <SelectValue placeholder="No owner">
                      {(value: string) =>
                        value && value !== "none"
                          ? (owners.find((owner) => owner.user_id === value)
                              ?.email ?? "No owner")
                          : "No owner"
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No owner</SelectItem>
                    {owners.map((owner) => (
                      <SelectItem key={owner.user_id} value={owner.user_id}>
                        {owner.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="brief-reviewerId">Reviewer</FieldLabel>
                <Select
                  value={form.reviewerId || "none"}
                  onValueChange={(value) =>
                    update("reviewerId", value === "none" ? "" : (value ?? ""))
                  }
                >
                  <SelectTrigger id="brief-reviewerId" className="w-full">
                    <SelectValue placeholder="No reviewer">
                      {(value: string) =>
                        value && value !== "none"
                          ? (owners.find((owner) => owner.user_id === value)
                              ?.email ?? "No reviewer")
                          : "No reviewer"
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No reviewer</SelectItem>
                    {owners.map((owner) => (
                      <SelectItem key={owner.user_id} value={owner.user_id}>
                        {owner.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                variant="outline"
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
              {isPending ? "Saving..." : "Save brief"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
