"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import {
  createContentOpportunityAction,
  updateContentOpportunityAction,
} from "./content-opportunity-actions";
import { upsertContentPermissionAction } from "./content-permission-actions";
import {
  CONTENT_STATUSES,
  leadTimeSchedule,
  type ContentOpportunityRow,
} from "./content-opportunity-shared";
import type { ContentPermissionRow } from "./content-permission-shared";
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
import type {
  ActiveContentBriefTemplate,
  TemplateField,
} from "./content-brief-template-shared";
import { Spinner } from "@/components/ui/spinner";
import { formatDateTime } from "@/lib/format";
import { EmptyState } from "@/components/portal/empty-state";

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
    internalNotes: opportunity?.internal_notes ?? "",
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

function consentFormStateFor(permission: ContentPermissionRow | null) {
  return {
    permittedUse: permission?.permitted_use ?? "",
    usageLimits: permission?.usage_limits ?? "",
    consentOnFileAt: permission?.consent_on_file_at ?? "",
  };
}

type ConsentFormState = ReturnType<typeof consentFormStateFor>;

export function ContentOpportunityTab({
  calendarItemId,
  itemStartsAt,
  opportunity,
  owners,
  activeTemplates,
  defaultLeadTimeDays,
  canManage,
  isSensitiveTopic,
  toneGuidance,
}: {
  calendarItemId: string;
  itemStartsAt: string;
  opportunity: ContentOpportunityRow | null;
  owners: CalendarOwner[];
  activeTemplates: ActiveContentBriefTemplate[];
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

  const [consentMode, setConsentMode] = useState<"view" | "edit">("view");
  const [consentForm, setConsentForm] = useState<ConsentFormState>(() =>
    consentFormStateFor(opportunity?.content_permission ?? null),
  );
  const [consentError, setConsentError] = useState<string | null>(null);
  const [isConsentPending, startConsentTransition] = useTransition();

  const currentTemplateId =
    mode === "edit" ? form.templateId : (opportunity?.template_id ?? null);
  const requiresConsent =
    activeTemplates.find((template) => template.id === currentTemplateId)
      ?.requires_consent ?? false;

  function startEditingConsent() {
    setConsentForm(
      consentFormStateFor(opportunity?.content_permission ?? null),
    );
    setConsentError(null);
    setConsentMode("edit");
  }

  function handleConsentSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setConsentError(null);
    if (!opportunity) {
      setConsentError("Save this brief first before recording consent.");
      return;
    }

    const formData = new FormData();
    formData.set("permittedUse", consentForm.permittedUse);
    formData.set("usageLimits", consentForm.usageLimits);
    formData.set("consentOnFileAt", consentForm.consentOnFileAt);

    startConsentTransition(async () => {
      const result = await upsertContentPermissionAction(
        opportunity.id,
        formData,
      );
      if ("error" in result) {
        setConsentError(result.error);
        return;
      }
      setConsentMode("view");
      router.refresh();
    });
  }

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
              ? "Start one to capture the angle, owner, and consent for this piece."
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
          {requiresConsent && (
            <Field className="rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <FieldLabel htmlFor="consent-section">
                  Community-story consent
                </FieldLabel>
                {canManage && consentMode === "view" && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Edit consent"
                    onClick={startEditingConsent}
                  >
                    <Pencil />
                  </Button>
                )}
              </div>
              <div id="consent-section" className="flex flex-col gap-2">
                {consentError && (
                  <Alert variant="destructive">
                    <AlertDescription>{consentError}</AlertDescription>
                  </Alert>
                )}
                {consentMode === "view" ? (
                  opportunity.content_permission ? (
                    <>
                      <ReadOnlyField
                        label="Permitted use"
                        htmlFor="consent-permitted-use"
                      >
                        {opportunity.content_permission.permitted_use}
                      </ReadOnlyField>
                      <ReadOnlyField
                        label="Usage limits"
                        htmlFor="consent-usage-limits"
                      >
                        {opportunity.content_permission.usage_limits || "—"}
                      </ReadOnlyField>
                      <ReadOnlyField
                        label="Consent on file"
                        htmlFor="consent-on-file"
                      >
                        {opportunity.content_permission.consent_on_file_at}
                      </ReadOnlyField>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-destructive">
                        No consent recorded yet. This is required before
                        approving, scheduling, or publishing this content.
                      </p>
                      {canManage && (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="self-start"
                          onClick={startEditingConsent}
                        >
                          Record consent
                        </Button>
                      )}
                    </>
                  )
                ) : (
                  <form onSubmit={handleConsentSubmit}>
                    <FieldGroup>
                      <Field>
                        <FieldLabel htmlFor="consent-permittedUse">
                          Permitted use
                        </FieldLabel>
                        <Textarea
                          id="consent-permittedUse"
                          required
                          value={consentForm.permittedUse}
                          onChange={(event) =>
                            setConsentForm((prev) => ({
                              ...prev,
                              permittedUse: event.target.value,
                            }))
                          }
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="consent-usageLimits">
                          Usage limits
                        </FieldLabel>
                        <Textarea
                          id="consent-usageLimits"
                          placeholder="e.g. social only, no last names"
                          value={consentForm.usageLimits}
                          onChange={(event) =>
                            setConsentForm((prev) => ({
                              ...prev,
                              usageLimits: event.target.value,
                            }))
                          }
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="consent-onFileAt">
                          Consent on file
                        </FieldLabel>
                        <Input
                          id="consent-onFileAt"
                          type="date"
                          required
                          value={consentForm.consentOnFileAt}
                          onChange={(event) =>
                            setConsentForm((prev) => ({
                              ...prev,
                              consentOnFileAt: event.target.value,
                            }))
                          }
                        />
                      </Field>
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => setConsentMode("view")}
                        >
                          Cancel
                        </Button>
                        <Button type="submit" disabled={isConsentPending}>
                          {isConsentPending ? (
                            <>
                              <Spinner /> Saving...
                            </>
                          ) : (
                            "Save consent"
                          )}
                        </Button>
                      </div>
                    </FieldGroup>
                  </form>
                )}
              </div>
            </Field>
          )}
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
