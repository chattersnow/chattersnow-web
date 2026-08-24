"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Copy, Eye, Pencil } from "lucide-react";
import {
  archiveCalendarItemAction,
  duplicateCalendarItemAction,
  restoreCalendarItemAction,
  updateCalendarItemAction,
} from "./actions";
import {
  CATEGORIES,
  CALENDAR_STATUSES,
  DECISIONS,
  ITEM_TYPES,
  PRIORITY_TIERS,
  VISIBILITIES,
  labelFor,
  needsDecision,
  ownerEmail,
  type CalendarItemRow,
  type CalendarOwner,
  type CalendarProgram,
} from "./calendar-shared";
import {
  CalendarStatusBadge,
  CalendarVisibilityBadge,
  CategoryBadges,
  DecisionBadge,
  PriorityTierBadge,
} from "./calendar-badges";
import { cn } from "@/lib/utils";
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
import { ReadOnlyField } from "@/components/ui/read-only-field";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ContentOpportunityTab } from "./content-opportunity-tab";

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

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
    form.decisionNote !== baseline.decisionNote
  );
}

export function CalendarItemDetailsSheet({
  item,
  owners,
  programs,
  defaultLeadTimeDays,
  canManage,
  trigger = "icon",
}: {
  item: CalendarItemRow;
  owners: CalendarOwner[];
  programs: CalendarProgram[];
  defaultLeadTimeDays: number;
  canManage: boolean;
  trigger?: "icon" | "chip";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [form, setForm] = useState<FormState>(() => formStateFor(item));
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [discardTarget, setDiscardTarget] = useState<"toggle" | "close" | null>(null);
  const formId = `edit-calendar-item-form-${item.id}`;
  const dirty = isDirty(form, item);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleListValue(key: "categories" | "programIds", value: string) {
    setForm((prev) => {
      const list = prev[key];
      const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
      return { ...prev, [key]: next };
    });
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && mode === "edit" && dirty) {
      setDiscardTarget("close");
      return;
    }
    setOpen(nextOpen);
    if (!nextOpen) {
      setMode("view");
      setForm(formStateFor(item));
      setError(null);
      setWarning(null);
    }
  }

  function requestExitEditMode() {
    if (dirty) {
      setDiscardTarget("toggle");
      return;
    }
    setMode("view");
  }

  function confirmDiscard() {
    setForm(formStateFor(item));
    setError(null);
    setWarning(null);
    setMode("view");
    if (discardTarget === "close") {
      setOpen(false);
    }
    setDiscardTarget(null);
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
    for (const category of form.categories) formData.append("categories", category);
    for (const programId of form.programIds) formData.append("programIds", programId);
    formData.set("decision", form.decision);
    formData.set("decisionNote", form.decisionNote);

    startTransition(async () => {
      const result = await updateCalendarItemAction(item.id, formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      if (result.warning) setWarning(result.warning);
      setMode("view");
      router.refresh();
    });
  }

  function handleDuplicate() {
    startTransition(async () => {
      const result = await duplicateCalendarItemAction(item.id);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      handleOpenChange(false);
      router.refresh();
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
        <SheetTrigger
          render={
            trigger === "chip" ? (
              <button
                type="button"
                className={cn(
                  "w-full truncate rounded px-1 py-0.5 text-left text-[0.7rem] hover:bg-muted",
                  needsDecision(item) && "bg-destructive/10 text-destructive"
                )}
              />
            ) : (
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`View ${item.title}`} />
            )
          }
        >
          {trigger === "chip" ? item.title : <Eye />}
        </SheetTrigger>
        <SheetContent side="right" showCloseButton={false} className="data-[side=right]:sm:max-w-xl">
          <SheetHeader className="flex-row items-start gap-2 space-y-0">
            <SheetClose render={<Button type="button" variant="ghost" size="icon-sm" aria-label="Close" />}>
              <ArrowLeft />
            </SheetClose>
            <div className="flex flex-1 flex-col gap-0.5">
              <SheetTitle>{item.title}</SheetTitle>
              <SheetDescription>
                {mode === "edit" ? "Update this calendar item." : "View this calendar item's details."}
              </SheetDescription>
            </div>
            {canManage && mode === "view" && (
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Duplicate"
                  disabled={isPending}
                  onClick={handleDuplicate}
                >
                  <Copy />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Edit calendar item"
                  onClick={() => setMode("edit")}
                >
                  <Pencil />
                </Button>
              </div>
            )}
            {canManage && mode === "edit" && (
              <Button type="button" variant="ghost" size="sm" onClick={requestExitEditMode}>
                View
              </Button>
            )}
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

          <Tabs defaultValue="details">
            <TabsList variant="line">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="brief">Content brief</TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="mt-3">
              {mode === "view" ? (
                <div className="flex-1 overflow-y-auto px-4 pb-4">
                  <FieldGroup>
                    <ReadOnlyField label="Item type" htmlFor="item-type">
                      {labelFor(ITEM_TYPES, item.item_type)}
                    </ReadOnlyField>
                    <Field orientation="responsive">
                      <ReadOnlyField label="Starts" htmlFor="item-starts">
                        {dateFormatter.format(new Date(item.starts_at))}
                      </ReadOnlyField>
                      <ReadOnlyField label="Ends" htmlFor="item-ends">
                        {item.ends_at ? dateFormatter.format(new Date(item.ends_at)) : "—"}
                      </ReadOnlyField>
                    </Field>
                    <ReadOnlyField label="Summary" htmlFor="item-summary">
                      {item.summary || "—"}
                    </ReadOnlyField>
                    <Field orientation="responsive">
                      <Field>
                        <FieldLabel htmlFor="item-priority">Priority</FieldLabel>
                        <div id="item-priority">
                          <PriorityTierBadge tier={item.priority_tier} />
                        </div>
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="item-status">Calendar status</FieldLabel>
                        <div id="item-status">
                          <CalendarStatusBadge status={item.calendar_status} />
                        </div>
                      </Field>
                    </Field>
                    <Field orientation="responsive">
                      <Field>
                        <FieldLabel htmlFor="item-visibility">Visibility</FieldLabel>
                        <div id="item-visibility">
                          <CalendarVisibilityBadge visibility={item.visibility} />
                        </div>
                      </Field>
                      <ReadOnlyField label="Owner" htmlFor="item-owner">
                        {ownerEmail(owners, item.owner_id)}
                      </ReadOnlyField>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="item-categories">Categories</FieldLabel>
                      <div id="item-categories">
                        <CategoryBadges categories={item.categories} />
                      </div>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="item-decision">Decision</FieldLabel>
                      <div id="item-decision" className="flex flex-col gap-1">
                        <DecisionBadge decision={item.decision} />
                        {item.decision_note && <p className="app-muted text-sm">{item.decision_note}</p>}
                      </div>
                    </Field>
                  </FieldGroup>
                </div>
              ) : (
                <form id={formId} onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
                  <div className="flex-1 overflow-y-auto px-4 pb-4">
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
                        <Select value={form.itemType} onValueChange={(value) => update("itemType", value ?? form.itemType)}>
                          <SelectTrigger id="edit-itemType" className="w-full">
                            <SelectValue placeholder="Select item type">
                              {(value: string) => ITEM_TYPES.find((option) => option.value === value)?.label}
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
                            onChange={(event) => update("startsAt", event.target.value)}
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
                            onChange={(event) => update("timeZone", event.target.value)}
                          />
                        </Field>
                        <Field>
                          <FieldLabel htmlFor="edit-recurrenceRule">Recurrence</FieldLabel>
                          <Input
                            id="edit-recurrenceRule"
                            placeholder="e.g. Annual, March 31"
                            value={form.recurrenceRule}
                            onChange={(event) => update("recurrenceRule", event.target.value)}
                          />
                        </Field>
                      </Field>

                      <Field orientation="responsive">
                        <Field>
                          <FieldLabel htmlFor="edit-priorityTier">Priority</FieldLabel>
                          <Select
                            value={form.priorityTier}
                            onValueChange={(value) => update("priorityTier", value ?? "3")}
                          >
                            <SelectTrigger id="edit-priorityTier" className="w-full">
                              <SelectValue placeholder="Select priority">
                                {(value: string) => PRIORITY_TIERS.find((option) => option.value === value)?.label}
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
                          <FieldLabel htmlFor="edit-calendarStatus">Calendar status</FieldLabel>
                          <Select
                            value={form.calendarStatus}
                            onValueChange={(value) => update("calendarStatus", value ?? "idea")}
                          >
                            <SelectTrigger id="edit-calendarStatus" className="w-full">
                              <SelectValue placeholder="Select status">
                                {(value: string) => CALENDAR_STATUSES.find((option) => option.value === value)?.label}
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
                        <FieldLabel htmlFor="edit-priorityRationale">Priority rationale</FieldLabel>
                        <Textarea
                          id="edit-priorityRationale"
                          value={form.priorityRationale}
                          onChange={(event) => update("priorityRationale", event.target.value)}
                        />
                      </Field>

                      <Field orientation="responsive">
                        <Field>
                          <FieldLabel htmlFor="edit-visibility">Visibility</FieldLabel>
                          <Select
                            value={form.visibility}
                            onValueChange={(value) => update("visibility", value ?? "internal")}
                          >
                            <SelectTrigger id="edit-visibility" className="w-full">
                              <SelectValue placeholder="Select visibility">
                                {(value: string) => VISIBILITIES.find((option) => option.value === value)?.label}
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
                            onValueChange={(value) => update("ownerId", value === "none" ? "" : value ?? "")}
                          >
                            <SelectTrigger id="edit-ownerId" className="w-full">
                              <SelectValue placeholder="No owner">
                                {(value: string) =>
                                  value && value !== "none"
                                    ? owners.find((owner) => owner.user_id === value)?.email ?? "No owner"
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
                        <FieldLabel htmlFor="edit-categories-group">Categories</FieldLabel>
                        <div id="edit-categories-group" className="flex flex-col gap-2">
                          {CATEGORIES.map((category) => (
                            <label key={category.value} className="flex items-center gap-2 text-sm">
                              <Checkbox
                                checked={form.categories.includes(category.value)}
                                onCheckedChange={() => toggleListValue("categories", category.value)}
                              />
                              {category.label}
                            </label>
                          ))}
                        </div>
                      </Field>

                      {programs.length > 0 && (
                        <Field>
                          <FieldLabel htmlFor="edit-programs-group">Related programs</FieldLabel>
                          <div id="edit-programs-group" className="flex flex-col gap-2">
                            {programs.map((program) => (
                              <label key={program.id} className="flex items-center gap-2 text-sm">
                                <Checkbox
                                  checked={form.programIds.includes(program.id)}
                                  onCheckedChange={() => toggleListValue("programIds", program.id)}
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
                            onValueChange={(value) => update("decision", value === "none" ? "" : value ?? "")}
                          >
                            <SelectTrigger id="edit-decision" className="w-full">
                              <SelectValue placeholder="No decision yet">
                                {(value: string) =>
                                  value && value !== "none"
                                    ? DECISIONS.find((option) => option.value === value)?.label
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
                          <FieldLabel htmlFor="edit-decisionNote">Decision note</FieldLabel>
                          <Input
                            id="edit-decisionNote"
                            placeholder={form.decision === "skip" ? "Reason (required)" : "Optional"}
                            value={form.decisionNote}
                            onChange={(event) => update("decisionNote", event.target.value)}
                          />
                        </Field>
                      </Field>
                    </FieldGroup>
                  </div>

                  <SheetFooter className="flex-row flex-wrap justify-end gap-2 border-t bg-muted/50">
                    {item.calendar_status === "archived" ? (
                      <Button type="button" variant="outline" disabled={isPending} onClick={handleRestore}>
                        Restore
                      </Button>
                    ) : (
                      <Button type="button" variant="outline" disabled={isPending} onClick={handleArchive}>
                        Archive
                      </Button>
                    )}
                    <Button type="submit" form={formId} disabled={isPending}>
                      {isPending ? "Saving..." : "Save changes"}
                    </Button>
                  </SheetFooter>
                </form>
              )}
            </TabsContent>

            <TabsContent value="brief" className="mt-3">
              <ContentOpportunityTab
                calendarItemId={item.id}
                itemStartsAt={item.starts_at}
                opportunity={item.content_opportunity}
                owners={owners}
                defaultLeadTimeDays={defaultLeadTimeDays}
                canManage={canManage}
              />
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>

      <AlertDialog open={discardTarget !== null} onOpenChange={(next) => !next && setDiscardTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes to this calendar item. Leaving now will discard them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDiscardTarget(null)}>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDiscard}>Discard changes</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
