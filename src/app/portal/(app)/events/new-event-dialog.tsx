"use client";

import { FormEvent, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createEventAction } from "./actions";
import { listProgramsAction, type Program } from "../programs/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";

const VISIBILITIES = [
  { value: "private", label: "Private" },
  { value: "public", label: "Public" },
];

const STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
];

function getInitialFormState() {
  return {
    name: "",
    description: "",
    eventType: "",
    location: "",
    venue: "",
    startsAt: "",
    endsAt: "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    visibility: "private",
    status: "draft",
    programId: "",
    flierUrl: "",
  };
}

export function NewEventDialog({
  programs,
  triggerLabel = "New Event",
}: {
  programs?: Program[];
  triggerLabel?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // Callers that already query programs server-side pass them in; the sidebar
  // quick action has no such query, so fall back to loading them on open
  // rather than leaving the picker stuck on "No program".
  const [loadedPrograms, setLoadedPrograms] = useState<Program[]>([]);
  const programOptions = programs ?? loadedPrograms;
  const [form, setForm] = useState(getInitialFormState);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open || programs) return;
    listProgramsAction().then((result) => {
      if (!("error" in result)) setLoadedPrograms(result.data);
    });
  }, [open, programs]);

  function update<K extends keyof ReturnType<typeof getInitialFormState>>(
    key: K,
    value: ReturnType<typeof getInitialFormState>[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setForm(getInitialFormState());
      setError(null);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("name", form.name);
    formData.set("description", form.description);
    formData.set("eventType", form.eventType);
    formData.set("location", form.location);
    formData.set("venue", form.venue);
    formData.set("startsAt", form.startsAt);
    formData.set("endsAt", form.endsAt);
    formData.set("timezone", form.timezone);
    formData.set("visibility", form.visibility);
    formData.set("status", form.status);
    formData.set("programId", form.programId);
    formData.set("flierUrl", form.flierUrl);

    startTransition(async () => {
      const result = await createEventAction(formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      handleOpenChange(false);
      toast.success("Event created.");
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={<Button type="button" className="shrink-0 whitespace-nowrap" />}
      >
        {triggerLabel}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create event</DialogTitle>
          <DialogDescription>
            Basic event details — expenses, sponsors, and giveaways are added
            separately.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="name">Event name</FieldLabel>
              <Input
                id="name"
                required
                value={form.name}
                onChange={(event) => update("name", event.target.value)}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="description">Description</FieldLabel>
              <Textarea
                id="description"
                value={form.description}
                onChange={(event) => update("description", event.target.value)}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="programId">Program</FieldLabel>
              <Select
                value={form.programId || "none"}
                onValueChange={(value) =>
                  update("programId", value === "none" ? "" : (value ?? ""))
                }
              >
                <SelectTrigger id="programId" className="w-full">
                  <SelectValue placeholder="No program">
                    {(value: string) =>
                      value && value !== "none"
                        ? (programOptions.find(
                            (program) => program.id === value,
                          )?.name ?? "No program")
                        : "No program"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No program</SelectItem>
                  {programOptions.map((program) => (
                    <SelectItem key={program.id} value={program.id}>
                      {program.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field orientation="responsive">
              <Field>
                <FieldLabel htmlFor="eventType">Event type</FieldLabel>
                <Input
                  id="eventType"
                  placeholder="e.g. Access Day"
                  value={form.eventType}
                  onChange={(event) => update("eventType", event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="venue">Venue / mountain</FieldLabel>
                <Input
                  id="venue"
                  value={form.venue}
                  onChange={(event) => update("venue", event.target.value)}
                />
              </Field>
            </Field>

            <Field>
              <FieldLabel htmlFor="location">Location</FieldLabel>
              <Input
                id="location"
                value={form.location}
                onChange={(event) => update("location", event.target.value)}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="flierUrl">Flier image URL</FieldLabel>
              <Input
                id="flierUrl"
                type="url"
                placeholder="https://drive.google.com/file/d/..."
                value={form.flierUrl}
                onChange={(event) => update("flierUrl", event.target.value)}
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

            <Field>
              <FieldLabel htmlFor="timezone">Timezone</FieldLabel>
              <Input
                id="timezone"
                required
                placeholder="e.g. America/Chicago"
                value={form.timezone}
                onChange={(event) => update("timezone", event.target.value)}
              />
            </Field>

            <Field orientation="responsive">
              <Field>
                <FieldLabel htmlFor="visibility">Visibility</FieldLabel>
                <Select
                  value={form.visibility}
                  onValueChange={(value) =>
                    update("visibility", value ?? "private")
                  }
                >
                  <SelectTrigger id="visibility" className="w-full">
                    <SelectValue placeholder="Select visibility">
                      {(value: string) =>
                        VISIBILITIES.find((option) => option.value === value)
                          ?.label ?? "Select visibility"
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
                <FieldLabel htmlFor="status">Status</FieldLabel>
                <Select
                  value={form.status}
                  onValueChange={(value) => update("status", value ?? "draft")}
                >
                  <SelectTrigger id="status" className="w-full">
                    <SelectValue placeholder="Select status">
                      {(value: string) =>
                        STATUSES.find((option) => option.value === value)
                          ?.label ?? "Select status"
                      }
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
            </Field>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
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
                "Create event"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
