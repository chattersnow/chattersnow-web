"use client";

import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { MyContactDetails } from "@/lib/constituent/contact";
import {
  EXPERIENCE_LEVELS,
  OTHER_MOUNTAIN,
  RIDING_DISCIPLINES,
  experienceLevelLabel,
  ridesSki,
  ridesSnowboard,
  ridingDisciplineLabel,
} from "@/lib/rider-profile";
import { RIDING_ASKED_FIELD } from "@/lib/rider-profile-form";
import type { RegistrationSummaryRow } from "./registration-steps";

/** What the riding questions hold while the form is open. */
export type RidingValues = {
  discipline: string;
  skiLevel: string;
  snowboardLevel: string;
  /** A name from the tenant's list, `OTHER_MOUNTAIN`, or `""`. */
  mountain: string;
  /** The typed name, when `mountain` is `OTHER_MOUNTAIN`. */
  otherMountain: string;
};

export const EMPTY_RIDING: RidingValues = {
  discipline: "",
  skiLevel: "",
  snowboardLevel: "",
  mountain: "",
  otherMountain: "",
};

/**
 * A linked registrant's own answers, to start step 2 from (#1415). Only ever
 * called with the caller's own record -- never with one matched from a typed
 * email, which would show anybody's riding level to whoever typed it. A
 * stored mountain that is not on today's list comes back as "Other" with the
 * name typed in, since editing the list never rewrites an answer.
 */
export function ridingValuesFromPerson(
  person: Pick<
    MyContactDetails,
    | "riding_discipline"
    | "ski_experience_level"
    | "snowboard_experience_level"
    | "preferred_mountain"
  >,
  mountains: readonly string[],
): RidingValues {
  const stored = person.preferred_mountain?.trim() ?? "";
  const listed = stored !== "" && mountains.includes(stored);
  return {
    discipline: person.riding_discipline ?? "",
    skiLevel: person.ski_experience_level ?? "",
    snowboardLevel: person.snowboard_experience_level ?? "",
    mountain: listed ? stored : stored ? OTHER_MOUNTAIN : "",
    otherMountain: listed ? "" : stored,
  };
}

/** Puts the answers on a registration's FormData, marked as asked. */
export function setRidingFields(formData: FormData, values: RidingValues) {
  formData.set(RIDING_ASKED_FIELD, "on");
  formData.set("ridingDiscipline", values.discipline);
  formData.set("skiExperienceLevel", values.skiLevel);
  formData.set("snowboardExperienceLevel", values.snowboardLevel);
  formData.set("preferredMountain", values.mountain);
  formData.set("otherMountain", values.otherMountain);
}

/** The review step's rows for the answers given. */
export function ridingSummaryRows(
  values: RidingValues,
): RegistrationSummaryRow[] {
  const rows: RegistrationSummaryRow[] = [];
  const discipline = ridingDisciplineLabel(values.discipline);
  if (discipline) rows.push({ label: "Skis or snowboard", value: discipline });
  const ski = ridesSki(values.discipline)
    ? experienceLevelLabel(values.skiLevel)
    : null;
  if (ski) rows.push({ label: "Experience on skis", value: ski });
  const snowboard = ridesSnowboard(values.discipline)
    ? experienceLevelLabel(values.snowboardLevel)
    : null;
  if (snowboard) {
    rows.push({ label: "Experience on a snowboard", value: snowboard });
  }
  const mountain =
    values.mountain === OTHER_MOUNTAIN
      ? values.otherMountain.trim()
      : values.mountain;
  if (mountain) rows.push({ label: "Home mountain", value: mountain });
  return rows;
}

function LevelField({
  id,
  label,
  value,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id} required>
        {label}
      </FieldLabel>
      <Select
        value={value || null}
        disabled={disabled}
        required
        onValueChange={(next) => onChange(String(next ?? ""))}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder="Select a level">
            {(selected: string | null) =>
              experienceLevelLabel(selected) ?? "Select a level"
            }
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
  );
}

/**
 * The riding questions on registration's second step (#1415), shared by the
 * anonymous form and the register-as-yourself form. Rendered only for a tenant
 * with the rider_profile module (#1408); `mountains` is that tenant's list.
 *
 * They were a follow-up after the registration was saved (#564), skippable and
 * so the most often missing. As fields they are asked before the write, the
 * discipline is required, and the level for each discipline ridden is too --
 * the RPC refuses a discipline without its level, so a form that let one
 * through would fail at the last step for a question two steps back.
 */
export function RidingFields({
  idPrefix,
  mountains,
  values,
  onChange,
  disabled,
}: {
  idPrefix: string;
  mountains: readonly string[];
  values: RidingValues;
  onChange: (values: RidingValues) => void;
  disabled?: boolean;
}) {
  const set = (patch: Partial<RidingValues>) =>
    onChange({ ...values, ...patch });

  return (
    <>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-riding-discipline`} required>
          Do you ski or snowboard?
        </FieldLabel>
        <Select
          value={values.discipline || null}
          disabled={disabled}
          required
          onValueChange={(next) => set({ discipline: String(next ?? "") })}
        >
          <SelectTrigger
            id={`${idPrefix}-riding-discipline`}
            className="w-full"
          >
            <SelectValue placeholder="Select one">
              {/* A render function replaces the placeholder, so it says
                  the placeholder itself while nothing is picked. */}
              {(selected: string | null) =>
                ridingDisciplineLabel(selected) ?? "Select one"
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

      {ridesSki(values.discipline) && (
        <LevelField
          id={`${idPrefix}-ski-level`}
          label="Experience on skis"
          value={values.skiLevel}
          onChange={(skiLevel) => set({ skiLevel })}
          disabled={disabled}
        />
      )}

      {ridesSnowboard(values.discipline) && (
        <LevelField
          id={`${idPrefix}-snowboard-level`}
          label="Experience on a snowboard"
          value={values.snowboardLevel}
          onChange={(snowboardLevel) => set({ snowboardLevel })}
          disabled={disabled}
        />
      )}

      <Field>
        <FieldLabel htmlFor={`${idPrefix}-mountain`}>Home mountain</FieldLabel>
        <Select
          value={values.mountain || null}
          disabled={disabled}
          onValueChange={(next) => set({ mountain: String(next ?? "") })}
        >
          <SelectTrigger id={`${idPrefix}-mountain`} className="w-full">
            <SelectValue placeholder="Select a mountain" />
          </SelectTrigger>
          <SelectContent>
            {mountains.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
            <SelectItem value={OTHER_MOUNTAIN}>{OTHER_MOUNTAIN}</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      {values.mountain === OTHER_MOUNTAIN && (
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-other-mountain`}>
            Which mountain?
          </FieldLabel>
          <Input
            id={`${idPrefix}-other-mountain`}
            autoComplete="off"
            value={values.otherMountain}
            disabled={disabled}
            onChange={(event) => set({ otherMountain: event.target.value })}
          />
        </Field>
      )}
    </>
  );
}
