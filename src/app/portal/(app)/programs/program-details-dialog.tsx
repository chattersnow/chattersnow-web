"use client";

import { FormEvent, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Eye, Pencil } from "lucide-react";
import { listProgramEventsAction, updateProgramAction, type ProgramEvent } from "./actions";
import { ProgramStatusBadge, type ProgramRow } from "./program-badges";
import { StatusBadge, VisibilityBadge } from "../events/event-badges";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

const STATUSES = [
  { value: "pilot", label: "Pilot" },
  { value: "active", label: "Active" },
  { value: "retired", label: "Retired" },
];

type FormState = { name: string; description: string; status: string };

function formStateFor(program: ProgramRow): FormState {
  return { name: program.name, description: program.description ?? "", status: program.status };
}

function isDirty(form: FormState, program: ProgramRow) {
  const baseline = formStateFor(program);
  return (
    form.name !== baseline.name ||
    form.description !== baseline.description ||
    form.status !== baseline.status
  );
}

export function ProgramDetailsDialog({ program, canManage }: { program: ProgramRow; canManage: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [form, setForm] = useState<FormState>(() => formStateFor(program));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [discardTarget, setDiscardTarget] = useState<"toggle" | "close" | null>(null);
  const [events, setEvents] = useState<ProgramEvent[] | null>(null);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const formId = `edit-program-form-${program.id}`;
  const dirty = isDirty(form, program);

  useEffect(() => {
    if (!open) return;
    listProgramEventsAction(program.id).then((result) => {
      if ("error" in result) {
        setEventsError(result.error);
      } else {
        setEventsError(null);
        setEvents(result.data);
      }
    });
  }, [open, program.id]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && mode === "edit" && dirty) {
      setDiscardTarget("close");
      return;
    }
    setOpen(nextOpen);
    if (nextOpen) {
      setForm(formStateFor(program));
      setError(null);
      setMode("view");
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
    setForm(formStateFor(program));
    setError(null);
    setMode("view");
    if (discardTarget === "close") {
      setOpen(false);
    }
    setDiscardTarget(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("name", form.name);
    formData.set("description", form.description);
    formData.set("status", form.status);

    startTransition(async () => {
      const result = await updateProgramAction(program.id, formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setMode("view");
      router.refresh();
    });
  }

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetTrigger
          render={<Button type="button" variant="ghost" size="icon-sm" aria-label={`View ${program.name}`} />}
        >
          <Eye />
        </SheetTrigger>
        <SheetContent side="right" showCloseButton={false} className="data-[side=right]:sm:max-w-lg">
          <SheetHeader className="flex-row items-start gap-2 space-y-0">
            <SheetClose render={<Button type="button" variant="ghost" size="icon-sm" aria-label="Close" />}>
              <ArrowLeft />
            </SheetClose>
            <div className="flex flex-1 flex-col gap-0.5">
              <SheetTitle>{program.name}</SheetTitle>
              <SheetDescription>
                {mode === "edit" ? "Update this program's details." : "View this program's details."}
              </SheetDescription>
            </div>
            {canManage &&
              (mode === "view" ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Edit program"
                  onClick={() => setMode("edit")}
                >
                  <Pencil />
                </Button>
              ) : (
                <Button type="button" variant="ghost" size="sm" onClick={requestExitEditMode}>
                  View
                </Button>
              ))}
          </SheetHeader>

          {mode === "view" ? (
            <div className="flex-1 overflow-y-auto px-4 pb-4">
              <FieldGroup>
                <ReadOnlyField label="Program name" htmlFor="program-name">
                  {program.name}
                </ReadOnlyField>
                <ReadOnlyField label="Description" htmlFor="program-description">
                  {program.description || "—"}
                </ReadOnlyField>
                <Field>
                  <FieldLabel htmlFor="program-status">Status</FieldLabel>
                  <div id="program-status">
                    <ProgramStatusBadge status={program.status} />
                  </div>
                </Field>

                <Field>
                  <FieldLabel htmlFor="program-events">
                    Events{events ? ` (${events.length})` : ""}
                  </FieldLabel>
                  <div id="program-events">
                    {eventsError ? (
                      <p className="app-muted text-sm">{eventsError}</p>
                    ) : events === null ? (
                      <p className="app-muted text-sm">Loading events...</p>
                    ) : events.length === 0 ? (
                      <p className="app-muted text-sm">No events tagged to this program yet.</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Event</TableHead>
                            <TableHead>Starts</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Visibility</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {events.map((event) => (
                            <TableRow key={event.id}>
                              <TableCell className="font-medium">{event.name}</TableCell>
                              <TableCell>{dateFormatter.format(new Date(event.starts_at))}</TableCell>
                              <TableCell>
                                <StatusBadge status={event.status} />
                              </TableCell>
                              <TableCell>
                                <VisibilityBadge visibility={event.visibility} />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                </Field>
              </FieldGroup>
            </div>
          ) : (
            <form id={formId} onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
              <div className="flex-1 overflow-y-auto px-4 pb-4">
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="program-edit-name">Program name</FieldLabel>
                    <Input
                      id="program-edit-name"
                      required
                      value={form.name}
                      onChange={(event) => update("name", event.target.value)}
                    />
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="program-edit-description">Description</FieldLabel>
                    <Textarea
                      id="program-edit-description"
                      value={form.description}
                      onChange={(event) => update("description", event.target.value)}
                    />
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="program-edit-status">Status</FieldLabel>
                    <Select value={form.status} onValueChange={(value) => update("status", value ?? "pilot")}>
                      <SelectTrigger id="program-edit-status" className="w-full">
                        <SelectValue placeholder="Select status">
                          {(value: string) => STATUSES.find((option) => option.value === value)?.label ?? "Select status"}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {STATUSES.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>

                  {error && (
                    <Alert variant="destructive">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}
                </FieldGroup>
              </div>
            </form>
          )}

          {mode === "edit" && (
            <SheetFooter className="flex-row justify-end border-t bg-muted/50">
              <Button type="submit" form={formId} disabled={isPending}>
                {isPending ? "Saving..." : "Save changes"}
              </Button>
            </SheetFooter>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={discardTarget !== null} onOpenChange={(next) => !next && setDiscardTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes to this program. Leaving now will discard them.
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
