"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createMeetingAction } from "./actions";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

const MEETING_TYPES = [
  { value: "board", label: "Board" },
  { value: "committee", label: "Committee" },
  { value: "annual", label: "Annual" },
  { value: "other", label: "Other" },
];

function getInitialFormState() {
  return {
    meetingDate: "",
    meetingType: "board",
    status: "scheduled",
    location: "",
    notes: "",
  };
}

export function NewMeetingDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(getInitialFormState);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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
    formData.set("meetingDate", form.meetingDate);
    formData.set("meetingType", form.meetingType);
    formData.set("status", form.status);
    formData.set("location", form.location);
    formData.set("notes", form.notes);

    startTransition(async () => {
      const result = await createMeetingAction(formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      handleOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={<Button type="button" className="shrink-0 whitespace-nowrap" />}
      >
        Schedule meeting
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Schedule meeting</DialogTitle>
          <DialogDescription>
            Basic meeting details — agenda and attendees are added separately.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="new-meeting-date">
                Date &amp; time
              </FieldLabel>
              <Input
                id="new-meeting-date"
                type="datetime-local"
                required
                value={form.meetingDate}
                onChange={(event) => update("meetingDate", event.target.value)}
              />
            </Field>

            <Field orientation="responsive">
              <Field>
                <FieldLabel htmlFor="new-meeting-type">Type</FieldLabel>
                <Select
                  value={form.meetingType}
                  onValueChange={(value) =>
                    update("meetingType", value ?? "board")
                  }
                >
                  <SelectTrigger id="new-meeting-type">
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    {MEETING_TYPES.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="new-meeting-location">Location</FieldLabel>
                <Input
                  id="new-meeting-location"
                  value={form.location}
                  onChange={(event) => update("location", event.target.value)}
                />
              </Field>
            </Field>

            <Field>
              <FieldLabel htmlFor="new-meeting-notes">Notes</FieldLabel>
              <Textarea
                id="new-meeting-notes"
                value={form.notes}
                onChange={(event) => update("notes", event.target.value)}
              />
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
                  <Spinner /> Saving...
                </>
              ) : (
                "Schedule meeting"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
