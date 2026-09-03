"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createEventIncidentAction } from "./incidents-actions";
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
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";

const SEVERITIES = [
  { value: "minor", label: "Minor" },
  { value: "moderate", label: "Moderate" },
  { value: "serious", label: "Serious" },
];

function toDatetimeLocalValue(date: Date) {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

export function LogIncidentDialog({
  eventId,
  triggerLabel = "+ Log incident",
  onSaved,
}: {
  eventId: string;
  triggerLabel?: string;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [occurredAt, setOccurredAt] = useState(() =>
    toDatetimeLocalValue(new Date()),
  );
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState("minor");
  const [peopleInvolved, setPeopleInvolved] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setOccurredAt(toDatetimeLocalValue(new Date()));
    setDescription("");
    setSeverity("minor");
    setPeopleInvolved("");
    setError(null);
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) reset();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData();
    // Converted here, in the browser, so the recorded instant is fixed
    // using the user's own timezone rather than the server's.
    formData.set("occurredAt", new Date(occurredAt).toISOString());
    formData.set("description", description);
    formData.set("severity", severity);
    formData.set("peopleInvolved", peopleInvolved);

    startTransition(async () => {
      const result = await createEventIncidentAction(eventId, formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      handleOpenChange(false);
      toast.success("Incident logged.");
      router.refresh();
      onSaved?.();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="secondary"
            className="shrink-0 whitespace-nowrap"
          />
        }
      >
        {triggerLabel}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Log an incident</DialogTitle>
          <DialogDescription>
            Record an incident that occurred at this event.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field orientation="responsive">
              <Field>
                <FieldLabel htmlFor="incident-occurredAt">When</FieldLabel>
                <Input
                  id="incident-occurredAt"
                  type="datetime-local"
                  value={occurredAt}
                  onChange={(event) => setOccurredAt(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="incident-severity">Severity</FieldLabel>
                <Select
                  value={severity}
                  onValueChange={(value) => setSeverity(value ?? "minor")}
                >
                  <SelectTrigger id="incident-severity" className="w-full">
                    <SelectValue placeholder="Select severity">
                      {(value: string) =>
                        SEVERITIES.find((option) => option.value === value)
                          ?.label ?? "Select severity"
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {SEVERITIES.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </Field>

            <Field>
              <FieldLabel htmlFor="incident-description">
                Description
              </FieldLabel>
              <Textarea
                id="incident-description"
                required
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="incident-peopleInvolved">
                People involved
              </FieldLabel>
              <Textarea
                id="incident-peopleInvolved"
                value={peopleInvolved}
                onChange={(event) => setPeopleInvolved(event.target.value)}
              />
            </Field>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </FieldGroup>

          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <>
                  <Spinner /> Saving...
                </>
              ) : (
                "Log incident"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
