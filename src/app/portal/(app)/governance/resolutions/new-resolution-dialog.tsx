"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createResolutionAction } from "./resolutions-actions";
import {
  ResolutionFormFields,
  emptyResolutionForm,
  packResolutionFormData,
  type ResolutionFormState,
} from "./resolution-form-fields";
import type { ResolutionMeetingOption } from "./resolutions-shared";
import { PersonPicker, type PickedPerson } from "../../people/person-picker";
import type { PersonListItem } from "../../people/actions";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const NO_MEETING = "none";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeZone: "UTC",
});

function meetingLabel(meeting: ResolutionMeetingOption) {
  return `${dateFormatter.format(new Date(meeting.meeting_date))} — ${meeting.meeting_type}`;
}

export function NewResolutionDialog({
  people,
  meetings,
}: {
  people: PersonListItem[];
  meetings: ResolutionMeetingOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [availablePeople, setAvailablePeople] = useState(people);
  const [selectedMover, setSelectedMover] = useState<PickedPerson | null>(null);
  const [selectedSeconder, setSelectedSeconder] = useState<PickedPerson | null>(
    null,
  );
  const [meetingId, setMeetingId] = useState<string>(NO_MEETING);
  const [form, setForm] = useState<ResolutionFormState>(() =>
    emptyResolutionForm(),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function update<K extends keyof ResolutionFormState>(
    key: K,
    value: ResolutionFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setAvailablePeople(people);
      setSelectedMover(null);
      setSelectedSeconder(null);
      setMeetingId(NO_MEETING);
      setForm(emptyResolutionForm());
      setError(null);
    }
  }

  function handlePersonCreated(person: PickedPerson) {
    setAvailablePeople((prev) => [...prev, { ...person, is_sponsor: false }]);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!selectedMover) {
      setError("Select or create a mover for this resolution.");
      return;
    }

    startTransition(async () => {
      const result = await createResolutionAction(
        meetingId === NO_MEETING ? null : meetingId,
        selectedMover.id,
        selectedSeconder?.id ?? null,
        packResolutionFormData(form),
      );
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={<Button type="button" className="shrink-0 whitespace-nowrap" />}
      >
        Add resolution
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add resolution</DialogTitle>
          <DialogDescription>Record a formal board motion.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel>Meeting</FieldLabel>
              <Select
                value={meetingId}
                onValueChange={(value) => setMeetingId(value ?? NO_MEETING)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="No meeting" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_MEETING}>No meeting</SelectItem>
                  {meetings.map((meeting) => (
                    <SelectItem key={meeting.id} value={meeting.id}>
                      {meetingLabel(meeting)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel>Mover</FieldLabel>
              <PersonPicker
                people={availablePeople}
                selected={selectedMover}
                onSelect={setSelectedMover}
                onPersonCreated={handlePersonCreated}
              />
            </Field>

            <Field>
              <FieldLabel>Seconder</FieldLabel>
              <PersonPicker
                people={availablePeople}
                selected={selectedSeconder}
                onSelect={setSelectedSeconder}
                onPersonCreated={handlePersonCreated}
              />
            </Field>

            <ResolutionFormFields
              form={form}
              update={update}
              idPrefix="new-resolution"
            />

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </FieldGroup>

          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Add resolution"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
