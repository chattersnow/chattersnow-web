"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { createArtworkCallAction, updateArtworkCallAction } from "./actions";
import type { ArtworkCall } from "../submission-types";

type EventOption = { id: string; name: string; starts_at: string };

const selectClassName =
  "h-9 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

/** `datetime-local` wants a local wall-clock string, not an instant. */
function toLocalInput(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function ArtworkCallDialog({
  call,
  events,
}: {
  /** Absent when opening a new call. */
  call?: ArtworkCall;
  events: EventOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const editing = !!call;
  const noEvents = !editing && events.length === 0;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = editing
        ? await updateArtworkCallAction(call.id, formData)
        : await createArtworkCallAction(formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      toast.success(editing ? "Call updated." : "Call opened.");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant={editing ? "ghost" : "default"}
            size="sm"
          />
        }
      >
        {editing ? "Edit call" : "New call"}
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit call for artwork" : "Open a call for artwork"}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? "The event cannot be changed — submissions already point at it."
                : "One call per event. Its link is generated when you save."}
            </DialogDescription>
          </DialogHeader>

          <div className="px-4 py-2">
            <FieldGroup>
              {editing ? null : (
                <Field>
                  <FieldLabel htmlFor="call-event">Event</FieldLabel>
                  <select
                    id="call-event"
                    name="eventId"
                    required
                    disabled={noEvents}
                    className={selectClassName}
                  >
                    {events.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                  {noEvents && (
                    <FieldDescription>
                      Every event already has a call. Create an event first.
                    </FieldDescription>
                  )}
                </Field>
              )}

              <Field orientation="horizontal">
                <Checkbox
                  id="call-open"
                  name="isOpen"
                  defaultChecked={call?.is_open ?? true}
                />
                <FieldLabel htmlFor="call-open">
                  Accepting submissions
                </FieldLabel>
              </Field>

              <Field>
                <FieldLabel htmlFor="call-opens">Opens</FieldLabel>
                <Input
                  id="call-opens"
                  name="opensAt"
                  type="datetime-local"
                  defaultValue={toLocalInput(call?.opens_at ?? null)}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="call-closes">Closes</FieldLabel>
                <Input
                  id="call-closes"
                  name="closesAt"
                  type="datetime-local"
                  defaultValue={toLocalInput(call?.closes_at ?? null)}
                />
                <FieldDescription>
                  Leave both empty to let the switch above decide.
                </FieldDescription>
              </Field>

              <Field>
                <FieldLabel htmlFor="call-max">
                  Images per submission
                </FieldLabel>
                <Input
                  id="call-max"
                  name="maxImages"
                  type="number"
                  min={1}
                  max={5}
                  defaultValue={call?.max_images ?? 3}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="call-intro">
                  What to tell the artist
                </FieldLabel>
                <Textarea
                  id="call-intro"
                  name="intro"
                  rows={5}
                  maxLength={4000}
                  defaultValue={call?.intro ?? ""}
                />
                <FieldDescription>
                  Shown above the form: what you are looking for, the theme, how
                  work will be credited.
                </FieldDescription>
              </Field>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </FieldGroup>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isPending || noEvents}>
              {isPending ? <Spinner /> : null}
              {editing ? "Save call" : "Open call"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
