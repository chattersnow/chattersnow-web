"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Copy, Trash2 } from "lucide-react";
import {
  deleteCalendarItemAction,
  duplicateCalendarItemAction,
  recordSensitiveTopicReviewAction,
} from "../actions";
import { generateNextYearInstanceAction } from "../recurrence-actions";
import { hasStructuredRecurrence } from "../calendar-recurrence";
import {
  ITEM_TYPES,
  isPastUndecided,
  labelFor,
  needsDecision,
  needsSensitiveReview,
  ownerEmail,
  type CalendarItemRow,
  type CalendarOwner,
  type CalendarProgram,
} from "../calendar-shared";
import {
  CalendarStatusBadge,
  CalendarVisibilityBadge,
  CategoryBadges,
  DecisionBadge,
  NeedsDecisionFlag,
  NeedsSensitiveReviewFlag,
  PastUndecidedFlag,
  PriorityTierBadge,
  SensitiveTopicBadge,
} from "../calendar-badges";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup } from "@/components/ui/field";
import { ReadOnlyField } from "@/components/ui/read-only-field";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ContentOpportunityTab } from "../content-opportunity-tab";
import { RelatedItemsTab } from "../related-items-tab";
import type { ActiveContentBriefTemplate } from "../content-brief-template-shared";
import type { ProgramSuggestionRule } from "../program-suggestion-shared";
import { EditCalendarItemSheet } from "./edit-calendar-item-sheet";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function CalendarItemDetailView({
  item,
  owners,
  programs,
  activeTemplates,
  defaultLeadTimeDays,
  programSuggestionRules,
  canManage,
}: {
  item: CalendarItemRow;
  owners: CalendarOwner[];
  programs: CalendarProgram[];
  activeTemplates: ActiveContentBriefTemplate[];
  defaultLeadTimeDays: number;
  programSuggestionRules: ProgramSuggestionRule[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const relatedProgramNames = item.program_ids
    .map((id) => programs.find((program) => program.id === id)?.name)
    .filter((name): name is string => Boolean(name));

  function handleDuplicate() {
    startTransition(async () => {
      const result = await duplicateCalendarItemAction(item.id);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      // The copy lands on the calendar list (titled "<title> (copy)").
      router.push("/portal/calendar");
      router.refresh();
    });
  }

  function handleGenerateNextYear() {
    startTransition(async () => {
      const result = await generateNextYearInstanceAction(item.id);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleRecordSensitiveReview() {
    startTransition(async () => {
      const result = await recordSensitiveTopicReviewAction(item.id);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteCalendarItemAction(item.id);
      if ("error" in result) {
        setConfirmDelete(false);
        setError(result.error);
        return;
      }
      setConfirmDelete(false);
      router.push("/portal/calendar");
      router.refresh();
    });
  }

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
            {item.title}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <PriorityTierBadge tier={item.priority_tier} />
            <CalendarStatusBadge status={item.calendar_status} />
            <CalendarVisibilityBadge visibility={item.visibility} />
            {needsDecision(item) && <NeedsDecisionFlag />}
            {isPastUndecided(item) && <PastUndecidedFlag />}
            {needsSensitiveReview(item) && <NeedsSensitiveReviewFlag />}
          </div>
        </div>
        {canManage && (
          <div className="flex shrink-0 items-center gap-2">
            {hasStructuredRecurrence(item) && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Generate next year"
                      disabled={isPending}
                      onClick={handleGenerateNextYear}
                    />
                  }
                >
                  <CalendarPlus />
                </TooltipTrigger>
                <TooltipContent>Generate next year</TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Duplicate"
                    disabled={isPending}
                    onClick={handleDuplicate}
                  />
                }
              >
                <Copy />
              </TooltipTrigger>
              <TooltipContent>Duplicate</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Delete calendar item"
                    disabled={isPending}
                    onClick={() => setConfirmDelete(true)}
                  />
                }
              >
                <Trash2 />
              </TooltipTrigger>
              <TooltipContent>Delete calendar item</TooltipContent>
            </Tooltip>
            <EditCalendarItemSheet
              item={item}
              owners={owners}
              programs={programs}
              programSuggestionRules={programSuggestionRules}
            />
          </div>
        )}
      </div>

      {error && (
        <Alert variant="destructive" className="mt-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="mt-6 flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="app-muted text-sm font-semibold">
              Schedule & details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <ReadOnlyField label="Item type" htmlFor="item-type">
                {labelFor(ITEM_TYPES, item.item_type)}
              </ReadOnlyField>
              <Field orientation="responsive">
                <ReadOnlyField label="Starts" htmlFor="item-starts">
                  {dateFormatter.format(new Date(item.starts_at))}
                </ReadOnlyField>
                <ReadOnlyField label="Ends" htmlFor="item-ends">
                  {item.ends_at
                    ? dateFormatter.format(new Date(item.ends_at))
                    : "—"}
                </ReadOnlyField>
              </Field>
              <Field orientation="responsive">
                <ReadOnlyField label="Time zone" htmlFor="item-time-zone">
                  {item.time_zone}
                </ReadOnlyField>
                <ReadOnlyField label="Recurrence" htmlFor="item-recurrence">
                  {item.recurrence_rule || "—"}
                </ReadOnlyField>
              </Field>
              <ReadOnlyField label="Summary" htmlFor="item-summary">
                {item.summary || "—"}
              </ReadOnlyField>
              <Field orientation="responsive">
                <ReadOnlyField label="Source" htmlFor="item-source">
                  {item.source || "—"}
                </ReadOnlyField>
                <ReadOnlyField label="Region" htmlFor="item-region">
                  {item.region || "—"}
                </ReadOnlyField>
              </Field>
              <ReadOnlyField label="Exceptions" htmlFor="item-exceptions">
                {item.exceptions.length > 0
                  ? item.exceptions
                      .map((exception) =>
                        exception &&
                        typeof exception === "object" &&
                        "note" in exception
                          ? String((exception as { note: unknown }).note)
                          : JSON.stringify(exception),
                      )
                      .join("; ")
                  : "—"}
              </ReadOnlyField>
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="app-muted text-sm font-semibold">
              Planning & decision
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field orientation="responsive">
                <ReadOnlyField label="Priority" htmlFor="item-priority">
                  <PriorityTierBadge tier={item.priority_tier} />
                </ReadOnlyField>
                <ReadOnlyField label="Calendar status" htmlFor="item-status">
                  <CalendarStatusBadge status={item.calendar_status} />
                </ReadOnlyField>
              </Field>
              <ReadOnlyField
                label="Priority rationale"
                htmlFor="item-priority-rationale"
              >
                {item.priority_rationale || "—"}
              </ReadOnlyField>
              <Field orientation="responsive">
                <ReadOnlyField label="Visibility" htmlFor="item-visibility">
                  <CalendarVisibilityBadge visibility={item.visibility} />
                </ReadOnlyField>
                <ReadOnlyField label="Owner" htmlFor="item-owner">
                  {ownerEmail(owners, item.owner_id)}
                </ReadOnlyField>
              </Field>
              <ReadOnlyField label="Categories" htmlFor="item-categories">
                <CategoryBadges categories={item.categories} />
              </ReadOnlyField>
              <ReadOnlyField
                label="Related programs"
                htmlFor="item-related-programs"
              >
                {relatedProgramNames.length > 0
                  ? relatedProgramNames.join(", ")
                  : "—"}
              </ReadOnlyField>
              <ReadOnlyField label="Decision" htmlFor="item-decision">
                <div className="flex flex-col gap-1">
                  <DecisionBadge decision={item.decision} />
                  {item.decision_note && (
                    <p className="app-muted text-sm">{item.decision_note}</p>
                  )}
                </div>
              </ReadOnlyField>
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="app-muted text-sm font-semibold">
              Sensitive topic
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2">
              {item.is_sensitive_topic ? (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <SensitiveTopicBadge
                      reviewed={Boolean(item.sensitive_review_by)}
                    />
                    {needsSensitiveReview(item) && <NeedsSensitiveReviewFlag />}
                  </div>
                  {item.tone_guidance && (
                    <p className="app-muted text-sm">{item.tone_guidance}</p>
                  )}
                  {item.sensitive_review_by ? (
                    <p className="app-muted text-xs">
                      Reviewed{" "}
                      {dateFormatter.format(
                        new Date(item.sensitive_review_at!),
                      )}{" "}
                      by {ownerEmail(owners, item.sensitive_review_by)}
                    </p>
                  ) : (
                    canManage && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="self-start"
                        disabled={isPending}
                        onClick={handleRecordSensitiveReview}
                      >
                        Record reviewer sign-off
                      </Button>
                    )
                  )}
                </>
              ) : (
                <span className="app-muted text-sm">Not flagged</span>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="app-muted text-sm font-semibold">
              Content brief
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ContentOpportunityTab
              calendarItemId={item.id}
              itemStartsAt={item.starts_at}
              opportunity={item.content_opportunity}
              owners={owners}
              activeTemplates={activeTemplates}
              defaultLeadTimeDays={defaultLeadTimeDays}
              canManage={canManage}
              isSensitiveTopic={item.is_sensitive_topic}
              toneGuidance={item.tone_guidance}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="app-muted text-sm font-semibold">
              Related items
            </CardTitle>
          </CardHeader>
          <CardContent>
            <RelatedItemsTab itemId={item.id} canManage={canManage} open />
          </CardContent>
        </Card>
      </div>

      <AlertDialog
        open={confirmDelete}
        onOpenChange={(next) => !next && setConfirmDelete(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this calendar item?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes &ldquo;{item.title}&rdquo; along with its
              content brief and related-item links. This can&apos;t be undone —
              to keep it out of active views without losing it, archive it
              instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmDelete(false)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isPending}
              onClick={handleDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
