"use client";

import { useEffect, useState } from "react";
import { listProgramPillarsAction } from "./actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

/** The value the pillar Select uses for "no pillar", since it cannot hold "". */
const NO_PILLAR = "__none__";

export type PublicProgramFields = {
  isPublic: boolean;
  pillar: string;
  emoji: string;
  sortOrder: string;
};

/**
 * The fields that decide how a program appears on the public site (#898).
 *
 * Shared by the create dialog and the edit sheet rather than written twice:
 * the two already disagreed about nothing, and four fields with a publication
 * switch among them is exactly the pair that drifts.
 *
 * The pillar list is fetched rather than passed down because the server page
 * that renders the table has no reason to read it -- only a form that is open
 * does, and only someone holding `programs:manage` can see one.
 */
export function ProgramPublicFields({
  idPrefix,
  values,
  status,
  onChange,
  disabled,
}: {
  idPrefix: string;
  values: PublicProgramFields;
  /** The program's lifecycle status, for the retired-and-public warning. */
  status: string;
  /** Merged into the parent's form state, which is wider than these four. */
  onChange: (patch: Partial<PublicProgramFields>) => void;
  disabled?: boolean;
}) {
  const [pillars, setPillars] = useState<string[] | null>(null);

  useEffect(() => {
    let active = true;
    listProgramPillarsAction().then((result) => {
      if (!active) return;
      // A failed read leaves the picker with only what this program already
      // has, which is better than blocking the rest of the form on it.
      setPillars("error" in result ? [] : result.data);
    });
    return () => {
      active = false;
    };
  }, []);

  // A pillar the copy no longer lists still has to be selectable, or opening
  // the form would silently re-save the program into a different group.
  const options = [
    ...new Set([...(pillars ?? []), ...(values.pillar ? [values.pillar] : [])]),
  ];

  return (
    <>
      <Field orientation="horizontal">
        <FieldContent>
          <FieldLabel htmlFor={`${idPrefix}-is-public`}>
            Show on the public site
          </FieldLabel>
          <FieldDescription>
            Lists this program on the public Programs page, if that page is set
            to read the Programs module. The description above is what visitors
            read.
          </FieldDescription>
        </FieldContent>
        <Switch
          id={`${idPrefix}-is-public`}
          checked={values.isPublic}
          disabled={disabled}
          onCheckedChange={(on) => onChange({ isPublic: Boolean(on) })}
        />
      </Field>

      {values.isPublic && status === "retired" && (
        <Alert>
          <AlertDescription>
            This program is retired and still shown on the public site. That is
            allowed — publication is separate from status — but check it is what
            you meant.
          </AlertDescription>
        </Alert>
      )}

      <Field>
        <FieldLabel htmlFor={`${idPrefix}-pillar`}>Pillar</FieldLabel>
        <Select
          value={values.pillar || NO_PILLAR}
          disabled={disabled}
          onValueChange={(value) =>
            onChange({
              pillar: value === NO_PILLAR ? "" : String(value ?? ""),
            })
          }
        >
          <SelectTrigger id={`${idPrefix}-pillar`} className="w-full">
            <SelectValue placeholder="No pillar">
              {(value: string) => (value === NO_PILLAR ? "No pillar" : value)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_PILLAR}>No pillar</SelectItem>
            {options.map((pillar) => (
              <SelectItem key={pillar} value={pillar}>
                {pillar}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldDescription>
          The heading this program is listed under. Pillars are written in Site
          Content; a program with no pillar is listed after the grouped ones.
        </FieldDescription>
      </Field>

      <Field>
        <FieldLabel htmlFor={`${idPrefix}-emoji`}>Emoji</FieldLabel>
        <Input
          id={`${idPrefix}-emoji`}
          value={values.emoji}
          disabled={disabled}
          maxLength={8}
          onChange={(event) => onChange({ emoji: event.target.value })}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor={`${idPrefix}-sort-order`}>Order</FieldLabel>
        <Input
          id={`${idPrefix}-sort-order`}
          type="number"
          step={1}
          value={values.sortOrder}
          disabled={disabled}
          onChange={(event) => onChange({ sortOrder: event.target.value })}
        />
        <FieldDescription>
          Lowest first within a pillar. Leave it blank and this program is
          listed after the numbered ones, alphabetically.
        </FieldDescription>
      </Field>
    </>
  );
}
