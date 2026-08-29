"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import {
  archiveCalendarItemAction,
  restoreCalendarItemAction,
  updateCalendarItemAction,
} from "../actions";
import {
  CATEGORIES,
  CALENDAR_STATUSES,
  DECISIONS,
  ITEM_TYPES,
  PRIORITY_TIERS,
  VISIBILITIES,
  type CalendarItemRow,
  type CalendarOwner,
  type CalendarProgram,
} from "../calendar-shared";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  suggestedProgramIds,
  type ProgramSuggestionRule,
} from "../program-suggestion-shared";
import { Spinner } from "@/components/ui/spinner";

function toDatetimeLocalValue(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function arraysEqual(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((value, index) => value === sortedB[index]);
}

function formStateFor(item: CalendarItemRow) {
  return {
    title: item.title,
    itemType: item.item_type,
    startsAt: toDatetimeLocalValue(item.starts_at),
    endsAt: toDatetimeLocalValue(item.ends_at),
    timeZone: item.time_zone,
    recurrenceRule: item.recurrence_rule ?? "",
    summary: item.summary ?? "",
    priorityTier: String(item.priority_tier),
    priorityRationale: item.priority_rationale ?? "",
    calendarStatus: item.calendar_status,
    visibility: item.visibility,
    ownerId: item.owner_id ?? "",
    categories: item.categories,
    programIds: item.program_ids,
    decision: item.decision ?? "",
    decisionNote: item.decision_note ?? "",
    isSensitiveTopic: item.is_sensitive_topic,
    toneGuidance: item.tone_guidance ?? "",
  };
}

type FormState = ReturnType<typeof formStateFor>;

function isDirty(form: FormState, item: CalendarItemRow) {
  const baseline = formStateFor(item);
  return (
    form.title !== baseline.title ||
    form.itemType !== baseline.itemType ||
    form.startsAt !== baseline.startsAt ||
    form.endsAt !== baseline.endsAt ||
    form.timeZone !== baseline.timeZone ||
    form.recurrenceRule !== baseline.recurrenceRule ||
    form.summary !== baseline.summary ||
    form.priorityTier !== baseline.priorityTier ||
    form.priorityRationale !== baseline.priorityRationale ||
    form.calendarStatus !== baseline.calendarStatus ||
    form.visibility !== baseline.visibility ||
    form.ownerId !== baseline.ownerId ||
    !arraysEqual(form.categories, baseline.categories) ||
    !arraysEqual(form.programIds, baseline.programIds) ||
    form.decision !== baseline.decision ||
    form.decisionNote !== baseline.decisionNote ||
    form.isSensitiveTopic !== baseline.isSensitiveTopic ||
    form.toneGuidance !== baseline.toneGuidance
  );
}

export function EditCalendarItemSheet({
  item,
  owners,
  programs,
  programSuggestionRules,
}: {
  item: CalendarItemRow;
  owners: CalendarOwner[];
  programs: CalendarProgram[];
  programSuggestionRules: ProgramSuggestionRule[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(() => formStateFor(item));
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const formId = `edit-calendar-item-form-${item.id}`;
  const dirty = isDirty(form, item);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleListValue(key: "categories" | "programIds", value: string) {
    setForm((prev) => {
      const list = prev[key];
      const next = list.includes(value)
        ? list.filter((v) => v !== value)
        : [...list, value];
      return { ...prev, [key]: next };
    });
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && dirty) {
      setConfirmingDiscard(true);
      return;
    }
    setOpen(nextOpen);
    if (nextOpen) {
      // Re-seed from the item on every open: a save + router.refresh() may
      // have replaced the `item` prop since this component mounted.
      setForm(formStateFor(item));
      setError(null);
      setWarning(null);
    }
  }

  function confirmDiscard() {
    setForm(formStateFor(item));
    setError(null);
    setWarning(null);
    setConfirmingDiscard(false);
    setOpen(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setWarning(null);

    const formData = new FormData();
    formData.set("title", form.title);
    formData.set("itemType", form.itemType);
    formData.set("startsAt", form.startsAt);
    formData.set("endsAt", form.endsAt);
    formData.set("timeZone", form.timeZone);
    formData.set("recurrenceRule", form.recurrenceRule);
    formData.set("summary", form.summary);
    formData.set("priorityTier", form.priorityTier);
    formData.set("priorityRationale", form.priorityRationale);
    formData.set("calendarStatus", form.calendarStatus);
    formData.set("visibility", form.visibility);
    formData.set("ownerId", form.ownerId);
    for (const category of form.categories)
      formData.append("categories", category);
    for (const programId of form.programIds)
      formData.append("programIds", programId);
    formData.set("decision", form.decision);
    formData.set("decisionNote", form.decisionNote);
    formData.set("isSensitiveTopic", String(form.isSensitiveTopic));
    formData.set("toneGuidance", form.toneGuidance);

    startTransition(async () => {
      const result = await updateCalendarItemAction(item.id, formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.refresh();
      if (result.warning) {
        // Keep the sheet open so the warning is actually seen.
        setWarning(result.warning);
        return;
      }
      setOpen(false);
    });
  }

  function handleArchive() {
    startTransition(async () => {
      const result = await archiveCalendarItemAction(item.id);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleRestore() {
    startTransition(async () => {
      const result = await restoreCalendarItemAction(item.id);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetTrigger render={<Button type="button" />}>
          <Pencil /> Edit
        </SheetTrigger>
        <SheetContent
          side="right"
          showCloseButton={false}
          size="xl"
          className="flex min-h-0 flex-1 flex-col"
        >
          <SheetHeader className="flex-row items-start gap-2 space-y-0">
            <Tooltip>
              <SheetClose
                render={
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Close"
                      />
                    }
                  />
                }
              >
                <ArrowLeft />
              </SheetClose>
              <TooltipContent>Close</TooltipContent>
            </Tooltip>
            <div className="flex flex-1 flex-col gap-0.5">
              <SheetTitle>{item.title}</SheetTitle>
              <SheetDescription>Update this calendar item.</SheetDescription>
            </div>
          </SheetHeader>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {warning && (
            <Alert>
              <AlertDescription>{warning}</AlertDescription>
            </Alert>
          )}

          <form
            id={formId}
            onSubmit={handleSubmit}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="edit-title">Title</FieldLabel>
                  <Input
                    id="edit-title"
                    required
                    value={form.title}
                    onChange={(event) => update("title", event.target.value)}
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="edit-itemType">Item type</FieldLabel>
                  <Select
                    value={form.itemType}
                    onValueChange={(value) =>
                      update("itemType", value ?? form.itemType)
                    }
                  >
                    <SelectTrigger id="edit-itemType" className="w-full">
                      <SelectValue placeholder="Select item type">
                        {(value: string) =>
                          ITEM_TYPES.find((option) => option.value === value)
                            ?.label
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {ITEM_TYPES.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field>
                  <FieldLabel htmlFor="edit-summary">Summary</FieldLabel>
                  <Textarea
                    id="edit-summary"
                    value={form.summary}
                    onChange={(event) => update("summary", event.target.value)}
                  />
                </Field>

                <Field orientation="responsive">
                  <Field>
                    <FieldLabel htmlFor="edit-startsAt">Starts</FieldLabel>
                    <Input
                      id="edit-startsAt"
                      required
                      type="datetime-local"
                      value={form.startsAt}
                      onChange={(event) =>
                        update("startsAt", event.target.value)
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="edit-endsAt">Ends</FieldLabel>
                    <Input
                      id="edit-endsAt"
                      type="datetime-local"
                      value={form.endsAt}
                      onChange={(event) => update("endsAt", event.target.value)}
                    />
                  </Field>
                </Field>

                <Field orientation="responsive">
                  <Field>
                    <FieldLabel htmlFor="edit-timeZone">Time zone</FieldLabel>
                    <Input
                      id="edit-timeZone"
                      required
                      value={form.timeZone}
                      onChange={(event) =>
                        update("timeZone", event.target.value)
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="edit-recurrenceRule">
                      Recurrence
                    </FieldLabel>
                    <Input
                      id="edit-recurrenceRule"
                      placeholder="e.g. Annual, March 31"
                      value={form.recurrenceRule}
                      onChange={(event) =>
                        update("recurrenceRule", event.target.value)
                      }
                    />
                  </Field>
                </Field>

                <Field orientation="responsive">
                  <Field>
                    <FieldLabel htmlFor="edit-priorityTier">
                      Priority
                    </FieldLabel>
                    <Select
                      value={form.priorityTier}
                      onValueChange={(value) =>
                        update("priorityTier", value ?? "3")
                      }
                    >
                      <SelectTrigger id="edit-priorityTier" className="w-full">
                        <SelectValue placeholder="Select priority">
                          {(value: string) =>
                            PRIORITY_TIERS.find(
                              (option) => option.value === value,
                            )?.label
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {PRIORITY_TIERS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="edit-calendarStatus">
                      Calendar status
                    </FieldLabel>
                    <Select
                      value={form.calendarStatus}
                      onValueChange={(value) =>
                        update("calendarStatus", value ?? "idea")
                      }
                    >
                      <SelectTrigger
                        id="edit-calendarStatus"
                        className="w-full"
                      >
                        <SelectValue placeholder="Select status">
                          {(value: string) =>
                            CALENDAR_STATUSES.find(
                              (option) => option.value === value,
                            )?.label
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {CALENDAR_STATUSES.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </Field>

                <Field>
                  <FieldLabel htmlFor="edit-priorityRationale">
                    Priority rationale
                  </FieldLabel>
                  <Textarea
                    id="edit-priorityRationale"
                    value={form.priorityRationale}
                    onChange={(event) =>
                      update("priorityRationale", event.target.value)
                    }
                  />
                </Field>

                <Field orientation="responsive">
                  <Field>
                    <FieldLabel htmlFor="edit-visibility">
                      Visibility
                    </FieldLabel>
                    <Select
                      value={form.visibility}
                      onValueChange={(value) =>
                        update("visibility", value ?? "internal")
                      }
                    >
                      <SelectTrigger id="edit-visibility" className="w-full">
                        <SelectValue placeholder="Select visibility">
                          {(value: string) =>
                            VISIBILITIES.find(
                              (option) => option.value === value,
                            )?.label
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {VISIBILITIES.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="edit-ownerId">Owner</FieldLabel>
                    <Select
                      value={form.ownerId || "none"}
                      onValueChange={(value) =>
                        update("ownerId", value === "none" ? "" : (value ?? ""))
                      }
                    >
                      <SelectTrigger id="edit-ownerId" className="w-full">
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
                </Field>

                <Field>
                  <FieldLabel htmlFor="edit-categories-group">
                    Categories
                  </FieldLabel>
                  <div
                    id="edit-categories-group"
                    className="flex flex-col gap-2"
                  >
                    {CATEGORIES.map((category) => (
                      <label
                        key={category.value}
                        className="flex items-center gap-2 text-sm"
                      >
                        <Checkbox
                          checked={form.categories.includes(category.value)}
                          onCheckedChange={() =>
                            toggleListValue("categories", category.value)
                          }
                        />
                        {category.label}
                      </label>
                    ))}
                  </div>
                </Field>

                {programs.length > 0 && (
                  <Field>
                    <FieldLabel htmlFor="edit-programs-group">
                      Related programs
                    </FieldLabel>
                    {(() => {
                      const suggestedIds = suggestedProgramIds(
                        programSuggestionRules,
                        form.itemType,
                        form.categories,
                        form.programIds,
                      );
                      const suggested = suggestedIds
                        .map((id) =>
                          programs.find((program) => program.id === id),
                        )
                        .filter((program): program is CalendarProgram =>
                          Boolean(program),
                        );
                      if (suggested.length === 0) return null;
                      return (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="app-muted text-xs">Suggested:</span>
                          {suggested.map((program) => (
                            <button
                              key={program.id}
                              type="button"
                              onClick={() =>
                                toggleListValue("programIds", program.id)
                              }
                              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/20"
                            >
                              + {program.name}
                            </button>
                          ))}
                        </div>
                      );
                    })()}
                    <div
                      id="edit-programs-group"
                      className="flex flex-col gap-2"
                    >
                      {programs.map((program) => (
                        <label
                          key={program.id}
                          className="flex items-center gap-2 text-sm"
                        >
                          <Checkbox
                            checked={form.programIds.includes(program.id)}
                            onCheckedChange={() =>
                              toggleListValue("programIds", program.id)
                            }
                          />
                          {program.name}
                        </label>
                      ))}
                    </div>
                  </Field>
                )}

                <Field orientation="responsive">
                  <Field>
                    <FieldLabel htmlFor="edit-decision">Decision</FieldLabel>
                    <Select
                      value={form.decision || "none"}
                      onValueChange={(value) =>
                        update(
                          "decision",
                          value === "none" ? "" : (value ?? ""),
                        )
                      }
                    >
                      <SelectTrigger id="edit-decision" className="w-full">
                        <SelectValue placeholder="No decision yet">
                          {(value: string) =>
                            value && value !== "none"
                              ? DECISIONS.find(
                                  (option) => option.value === value,
                                )?.label
                              : "No decision yet"
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No decision yet</SelectItem>
                        {DECISIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="edit-decisionNote">
                      Decision note
                    </FieldLabel>
                    <Input
                      id="edit-decisionNote"
                      placeholder={
                        form.decision === "skip"
                          ? "Reason (required)"
                          : "Optional"
                      }
                      value={form.decisionNote}
                      onChange={(event) =>
                        update("decisionNote", event.target.value)
                      }
                    />
                  </Field>
                </Field>

                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.isSensitiveTopic}
                    onCheckedChange={(checked) =>
                      update("isSensitiveTopic", checked === true)
                    }
                  />
                  Sensitive topic (requires reviewer sign-off distinct from
                  content approval)
                </label>

                {form.isSensitiveTopic && (
                  <Field>
                    <FieldLabel htmlFor="edit-toneGuidance">
                      Tone guidance
                    </FieldLabel>
                    <Textarea
                      id="edit-toneGuidance"
                      placeholder="How should staff write about this moment?"
                      value={form.toneGuidance}
                      onChange={(event) =>
                        update("toneGuidance", event.target.value)
                      }
                    />
                  </Field>
                )}
              </FieldGroup>
            </div>

            <SheetFooter className="flex-row flex-wrap justify-end gap-2 border-t bg-muted/50">
              {item.calendar_status === "archived" ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={isPending}
                  onClick={handleRestore}
                >
                  Restore
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={isPending}
                  onClick={handleArchive}
                >
                  Archive
                </Button>
              )}
              <Button type="submit" form={formId} disabled={isPending}>
                {isPending ? (
                  <>
                    <Spinner /> Saving...
                  </>
                ) : (
                  "Save changes"
                )}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={confirmingDiscard}
        onOpenChange={(next) => !next && setConfirmingDiscard(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes to this calendar item. Leaving now will
              discard them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmingDiscard(false)}>
              Keep editing
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmDiscard}>
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
