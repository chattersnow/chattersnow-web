"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  setRegistrantRiderProfileAction,
  type EventRegistrant,
} from "./registrants-actions";
import {
  EXPERIENCE_LEVELS,
  OTHER_MOUNTAIN,
  PREFERRED_MOUNTAINS,
  RIDING_DISCIPLINES,
  ridesSki,
  ridesSnowboard,
} from "@/lib/rider-profile";
import { runAction } from "@/components/portal/action-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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

function labelFor(
  options: readonly { value: string; label: string }[],
  value: string,
) {
  return options.find((option) => option.value === value)?.label;
}

/**
 * Door-side rider capture (issue #653).
 *
 * Same two questions the public post-registration prompt asks, for the people
 * it never reached: anyone who registered before that prompt existed, and every
 * walk-in. Saving writes through to the person's profile, and refreshes the
 * event-day snapshot when they are already checked in.
 */
export function RiderProfileDialog({
  registrant,
  open,
  onOpenChange,
  onSaved,
}: {
  registrant: EventRegistrant | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const router = useRouter();
  const rider = registrant?.rider ?? null;

  // Seeded from the person's live profile rather than the snapshot: this is an
  // edit of who they are, and the snapshot follows from it.
  const [discipline, setDiscipline] = useState(rider?.riding_discipline ?? "");
  const [skiLevel, setSkiLevel] = useState(rider?.ski_experience_level ?? "");
  const [snowboardLevel, setSnowboardLevel] = useState(
    rider?.snowboard_experience_level ?? "",
  );
  const storedMountain = rider?.preferred_mountain ?? "";
  const isListedMountain = (PREFERRED_MOUNTAINS as readonly string[]).includes(
    storedMountain,
  );
  const [mountain, setMountain] = useState(
    storedMountain === ""
      ? ""
      : isListedMountain
        ? storedMountain
        : OTHER_MOUNTAIN,
  );
  const [otherMountain, setOtherMountain] = useState(
    isListedMountain ? "" : storedMountain,
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!registrant) return;
    setError(null);

    const formData = new FormData();
    formData.set("ridingDiscipline", discipline);
    formData.set("skiExperienceLevel", skiLevel);
    formData.set("snowboardExperienceLevel", snowboardLevel);
    formData.set("preferredMountain", mountain);
    formData.set("otherMountain", otherMountain);

    startTransition(async () => {
      await runAction(
        () => setRegistrantRiderProfileAction(registrant.id, formData),
        {
          success: `Rider profile saved for ${registrant.name}.`,
          onError: setError,
          onSuccess: () => {
            onOpenChange(false);
            router.refresh();
            onSaved();
          },
        },
      );
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Rider profile</DialogTitle>
          <DialogDescription>
            How {registrant?.name ?? "this registrant"} rides. Saved to their
            person record and counted in the event&apos;s beginner figure.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="registrant-rider-discipline">
                Do they ski or ride?
              </FieldLabel>
              <Select
                value={discipline}
                onValueChange={(value) => setDiscipline(String(value ?? ""))}
              >
                <SelectTrigger
                  id="registrant-rider-discipline"
                  className="w-full"
                >
                  <SelectValue placeholder="Select one">
                    {(value: string) => labelFor(RIDING_DISCIPLINES, value)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {RIDING_DISCIPLINES.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {ridesSki(discipline) && (
              <Field>
                <FieldLabel htmlFor="registrant-rider-ski">
                  Experience on skis
                </FieldLabel>
                <Select
                  value={skiLevel}
                  onValueChange={(value) => setSkiLevel(String(value ?? ""))}
                >
                  <SelectTrigger id="registrant-rider-ski" className="w-full">
                    <SelectValue placeholder="Select one">
                      {(value: string) => labelFor(EXPERIENCE_LEVELS, value)}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {EXPERIENCE_LEVELS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}

            {ridesSnowboard(discipline) && (
              <Field>
                <FieldLabel htmlFor="registrant-rider-snowboard">
                  Experience on a snowboard
                </FieldLabel>
                <Select
                  value={snowboardLevel}
                  onValueChange={(value) =>
                    setSnowboardLevel(String(value ?? ""))
                  }
                >
                  <SelectTrigger
                    id="registrant-rider-snowboard"
                    className="w-full"
                  >
                    <SelectValue placeholder="Select one">
                      {(value: string) => labelFor(EXPERIENCE_LEVELS, value)}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {EXPERIENCE_LEVELS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}

            <Field>
              <FieldLabel htmlFor="registrant-rider-mountain">
                Preferred mountain
              </FieldLabel>
              <Select
                value={mountain}
                onValueChange={(value) => setMountain(String(value ?? ""))}
              >
                <SelectTrigger
                  id="registrant-rider-mountain"
                  className="w-full"
                >
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  {PREFERRED_MOUNTAINS.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                  <SelectItem value={OTHER_MOUNTAIN}>
                    {OTHER_MOUNTAIN}
                  </SelectItem>
                </SelectContent>
              </Select>
            </Field>

            {mountain === OTHER_MOUNTAIN && (
              <Field>
                <FieldLabel htmlFor="registrant-rider-other-mountain">
                  Which mountain?
                </FieldLabel>
                <Input
                  id="registrant-rider-other-mountain"
                  value={otherMountain}
                  onChange={(event) => setOtherMountain(event.target.value)}
                />
              </Field>
            )}

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
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <>
                  <Spinner /> Saving...
                </>
              ) : (
                "Save rider profile"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
