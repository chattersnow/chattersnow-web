"use client";

import { FormEvent, useState, useTransition } from "react";
import { saveRiderProfileAction } from "./rider-profile-actions";
import {
  EXPERIENCE_LEVELS,
  OTHER_MOUNTAIN,
  PREFERRED_MOUNTAINS,
  RIDING_DISCIPLINES,
  ridesSki,
  ridesSnowboard,
} from "@/lib/rider-profile";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function experienceLabel(value: string) {
  return EXPERIENCE_LEVELS.find((option) => option.value === value)?.label;
}

// Follow-up step shown after a successful registration (issue #564). It is
// never a gate: the registration is already saved by the time this renders,
// and skipping or abandoning it changes nothing.
export function RiderProfileForm({
  registrationId,
}: {
  registrationId: string;
}) {
  const [discipline, setDiscipline] = useState("");
  const [skiLevel, setSkiLevel] = useState("");
  const [snowboardLevel, setSnowboardLevel] = useState("");
  const [mountain, setMountain] = useState("");
  const [otherMountain, setOtherMountain] = useState("");
  const [company, setCompany] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("ridingDiscipline", discipline);
    formData.set("skiExperienceLevel", skiLevel);
    formData.set("snowboardExperienceLevel", snowboardLevel);
    formData.set("preferredMountain", mountain);
    formData.set("otherMountain", otherMountain);
    formData.set("company", company);

    startTransition(async () => {
      const result = await saveRiderProfileAction(registrationId, formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setSaved(true);
    });
  }

  if (skipped) return null;

  if (saved) {
    return (
      <Alert className="mt-4">
        <AlertDescription>
          Thanks — we&apos;ll use this to point you at the right group.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6">
      <FieldGroup>
        <div>
          <h3 className="font-heading text-lg">One more thing</h3>
          <p className="app-muted text-sm">
            Tell us how you ride so we can match you with the right group. This
            is optional — your spot is already saved.
          </p>
        </div>

        <Field>
          <FieldLabel htmlFor="rider-discipline">
            Do you ski or ride?
          </FieldLabel>
          <Select
            value={discipline}
            onValueChange={(value) => setDiscipline(String(value ?? ""))}
          >
            <SelectTrigger id="rider-discipline" className="w-full">
              <SelectValue placeholder="Select one">
                {(value: string) =>
                  RIDING_DISCIPLINES.find((option) => option.value === value)
                    ?.label
                }
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
            <FieldLabel htmlFor="rider-ski-level">
              Experience on skis
            </FieldLabel>
            <Select
              value={skiLevel}
              onValueChange={(value) => setSkiLevel(String(value ?? ""))}
            >
              <SelectTrigger id="rider-ski-level" className="w-full">
                <SelectValue placeholder="Select a level">
                  {(value: string) => experienceLabel(value)}
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
            <FieldLabel htmlFor="rider-snowboard-level">
              Experience on a snowboard
            </FieldLabel>
            <Select
              value={snowboardLevel}
              onValueChange={(value) => setSnowboardLevel(String(value ?? ""))}
            >
              <SelectTrigger id="rider-snowboard-level" className="w-full">
                <SelectValue placeholder="Select a level">
                  {(value: string) => experienceLabel(value)}
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
          <FieldLabel htmlFor="rider-mountain">
            Preferred mountain for meetups
          </FieldLabel>
          <Select
            value={mountain}
            onValueChange={(value) => setMountain(String(value ?? ""))}
          >
            <SelectTrigger id="rider-mountain" className="w-full">
              <SelectValue placeholder="Select a mountain">
                {(value: string) => value}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {PREFERRED_MOUNTAINS.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
              <SelectItem value={OTHER_MOUNTAIN}>{OTHER_MOUNTAIN}</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        {mountain === OTHER_MOUNTAIN && (
          <Field>
            <FieldLabel htmlFor="rider-other-mountain">
              Which mountain?
            </FieldLabel>
            <Input
              id="rider-other-mountain"
              autoComplete="off"
              value={otherMountain}
              onChange={(event) => setOtherMountain(event.target.value)}
            />
          </Field>
        )}

        {/* Honeypot: same pattern as the registration form above -- hidden
            from sighted/keyboard users, silently rejected server-side when a
            bot autofills it. Not type="hidden" -- bots skip those. */}
        <div className="sr-only" aria-hidden="true">
          <label htmlFor="rider-company">Company</label>
          <input
            id="rider-company"
            name="company"
            tabIndex={-1}
            autoComplete="off"
            value={company}
            onChange={(event) => setCompany(event.target.value)}
          />
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap gap-3">
          <Button type="submit" variant="rainbow" disabled={isPending}>
            {isPending ? "Saving..." : "Save details"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={isPending}
            onClick={() => setSkipped(true)}
          >
            Skip
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}
