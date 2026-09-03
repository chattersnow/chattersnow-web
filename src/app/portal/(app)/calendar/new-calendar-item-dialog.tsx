"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createCalendarItemAction } from "./actions";
import { ownerOptions } from "./calendar-shared";
import type { CalendarOwner, CalendarProgram } from "./calendar-shared";
import { PersonSelect } from "../people/person-select";
import {
  CATEGORIES,
  CALENDAR_STATUSES,
  DECISIONS,
  ITEM_TYPES,
  PRIORITY_TIERS,
  VISIBILITIES,
} from "./calendar-shared";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  suggestedProgramIds,
  type ProgramSuggestionRule,
} from "./program-suggestion-shared";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";

function getInitialFormState() {
  return {
    title: "",
    itemType: "community_observance",
    startsAt: "",
    endsAt: "",
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    recurrenceRule: "",
    summary: "",
    priorityTier: "3",
    priorityRationale: "",
    calendarStatus: "idea",
    visibility: "internal",
    ownerId: "",
    categories: [] as string[],
    programIds: [] as string[],
    decision: "",
    decisionNote: "",
    isSensitiveTopic: false,
    toneGuidance: "",
  };
}

type FormState = ReturnType<typeof getInitialFormState>;

export function NewCalendarItemDialog({
  owners,
  programs,
  programSuggestionRules,
}: {
  owners: CalendarOwner[];
  programs: CalendarProgram[];
  programSuggestionRules: ProgramSuggestionRule[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(getInitialFormState);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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
    setOpen(nextOpen);
    if (!nextOpen) {
      setForm(getInitialFormState());
      setError(null);
      setWarning(null);
    }
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
      const result = await createCalendarItemAction(formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      if (result.warning) {
        setWarning(result.warning);
      }
      handleOpenChange(false);
      toast.success("Calendar item added.");
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={<Button type="button" className="shrink-0 whitespace-nowrap" />}
      >
        New calendar item
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Create calendar item</DialogTitle>
          <DialogDescription>
            Chatter events, community observances, campaigns, and content
            opportunities all share this shape.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="title">Title</FieldLabel>
              <Input
                id="title"
                required
                value={form.title}
                onChange={(event) => update("title", event.target.value)}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="itemType">Item type</FieldLabel>
              <Select
                value={form.itemType}
                onValueChange={(value) =>
                  update("itemType", value ?? form.itemType)
                }
              >
                <SelectTrigger id="itemType" className="w-full">
                  <SelectValue placeholder="Select item type">
                    {(value: string) =>
                      ITEM_TYPES.find((option) => option.value === value)?.label
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
              <FieldLabel htmlFor="summary">Summary</FieldLabel>
              <Textarea
                id="summary"
                value={form.summary}
                onChange={(event) => update("summary", event.target.value)}
              />
            </Field>

            <Field orientation="responsive">
              <Field>
                <FieldLabel htmlFor="startsAt">Starts</FieldLabel>
                <Input
                  id="startsAt"
                  required
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(event) => update("startsAt", event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="endsAt">Ends</FieldLabel>
                <Input
                  id="endsAt"
                  type="datetime-local"
                  value={form.endsAt}
                  onChange={(event) => update("endsAt", event.target.value)}
                />
              </Field>
            </Field>

            <Field orientation="responsive">
              <Field>
                <FieldLabel htmlFor="timeZone">Time zone</FieldLabel>
                <Input
                  id="timeZone"
                  required
                  placeholder="e.g. America/Denver"
                  value={form.timeZone}
                  onChange={(event) => update("timeZone", event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="recurrenceRule">Recurrence</FieldLabel>
                <Input
                  id="recurrenceRule"
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
                <FieldLabel htmlFor="priorityTier">Priority</FieldLabel>
                <Select
                  value={form.priorityTier}
                  onValueChange={(value) =>
                    update("priorityTier", value ?? "3")
                  }
                >
                  <SelectTrigger id="priorityTier" className="w-full">
                    <SelectValue placeholder="Select priority">
                      {(value: string) =>
                        PRIORITY_TIERS.find((option) => option.value === value)
                          ?.label
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
                <FieldLabel htmlFor="calendarStatus">
                  Calendar status
                </FieldLabel>
                <Select
                  value={form.calendarStatus}
                  onValueChange={(value) =>
                    update("calendarStatus", value ?? "idea")
                  }
                >
                  <SelectTrigger id="calendarStatus" className="w-full">
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
              <FieldLabel htmlFor="priorityRationale">
                Priority rationale
              </FieldLabel>
              <Textarea
                id="priorityRationale"
                placeholder="Why this tier?"
                value={form.priorityRationale}
                onChange={(event) =>
                  update("priorityRationale", event.target.value)
                }
              />
            </Field>

            <Field orientation="responsive">
              <Field>
                <FieldLabel htmlFor="visibility">Visibility</FieldLabel>
                <Select
                  value={form.visibility}
                  onValueChange={(value) =>
                    update("visibility", value ?? "internal")
                  }
                >
                  <SelectTrigger id="visibility" className="w-full">
                    <SelectValue placeholder="Select visibility">
                      {(value: string) =>
                        VISIBILITIES.find((option) => option.value === value)
                          ?.label
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
                <FieldLabel htmlFor="ownerId">Owner</FieldLabel>
                <PersonSelect
                  id="ownerId"
                  people={ownerOptions(owners)}
                  value={form.ownerId || null}
                  onChange={(personId) => update("ownerId", personId ?? "")}
                  noneLabel="No owner"
                />
              </Field>
            </Field>

            <Field>
              <FieldLabel htmlFor="categories-group">Categories</FieldLabel>
              <div id="categories-group" className="flex flex-col gap-2">
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
                <FieldLabel htmlFor="programs-group">
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
                    .map((id) => programs.find((program) => program.id === id))
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
                <div id="programs-group" className="flex flex-col gap-2">
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
                <FieldLabel htmlFor="decision">Decision</FieldLabel>
                <Select
                  value={form.decision || "none"}
                  onValueChange={(value) =>
                    update("decision", value === "none" ? "" : (value ?? ""))
                  }
                >
                  <SelectTrigger id="decision" className="w-full">
                    <SelectValue placeholder="No decision yet">
                      {(value: string) =>
                        value && value !== "none"
                          ? DECISIONS.find((option) => option.value === value)
                              ?.label
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
                <FieldLabel htmlFor="decisionNote">Decision note</FieldLabel>
                <Input
                  id="decisionNote"
                  placeholder={
                    form.decision === "skip" ? "Reason (required)" : "Optional"
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
              Sensitive topic (requires reviewer sign-off distinct from content
              approval)
            </label>

            {form.isSensitiveTopic && (
              <Field>
                <FieldLabel htmlFor="toneGuidance">Tone guidance</FieldLabel>
                <Textarea
                  id="toneGuidance"
                  placeholder="How should staff write about this moment?"
                  value={form.toneGuidance}
                  onChange={(event) =>
                    update("toneGuidance", event.target.value)
                  }
                />
              </Field>
            )}

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
          </FieldGroup>

          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <>
                  <Spinner /> Creating...
                </>
              ) : (
                "Create calendar item"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
