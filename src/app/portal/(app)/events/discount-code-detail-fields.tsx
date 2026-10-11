"use client";

import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DISCOUNT_CODE_KINDS } from "@/lib/portal/impact-metrics";

export type DiscountCodeDetailsState = {
  description: string;
  source: string;
  kind: string;
  value: string;
};

export function emptyDiscountCodeDetails(): DiscountCodeDetailsState {
  return { description: "", source: "", kind: "", value: "" };
}

export function setDiscountCodeDetails(
  formData: FormData,
  details: DiscountCodeDetailsState,
) {
  formData.set("description", details.description);
  formData.set("source", details.source);
  formData.set("kind", details.kind);
  formData.set("value", details.value);
}

// Base UI's Select doesn't accept an empty-string item value.
const NO_KIND = "__none__";

function kindLabel(value: string) {
  return (
    DISCOUNT_CODE_KINDS.find((kind) => kind.value === value)?.label ?? "Not set"
  );
}

/**
 * Description, source, and what the code pays for and is worth (#1588). The
 * last two are what the Results card derives rental subsidies and participant
 * assistance from, so nobody types those figures at report time.
 */
export function DiscountCodeDetailFields({
  idPrefix,
  details,
  onChange,
}: {
  idPrefix: string;
  details: DiscountCodeDetailsState;
  onChange: (details: DiscountCodeDetailsState) => void;
}) {
  const update = <K extends keyof DiscountCodeDetailsState>(
    key: K,
    value: DiscountCodeDetailsState[K],
  ) => onChange({ ...details, [key]: value });

  return (
    <>
      <Field orientation="responsive">
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-description`}>
            Discount description
          </FieldLabel>
          <Input
            id={`${idPrefix}-description`}
            placeholder="e.g. $10 off"
            value={details.description}
            onChange={(event) => update("description", event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-source`}>Source</FieldLabel>
          <Input
            id={`${idPrefix}-source`}
            placeholder="e.g. ACME Vendor"
            value={details.source}
            onChange={(event) => update("source", event.target.value)}
          />
        </Field>
      </Field>

      <Field orientation="responsive">
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-kind`}>Pays for</FieldLabel>
          <Select
            value={details.kind || NO_KIND}
            onValueChange={(value) =>
              update("kind", !value || value === NO_KIND ? "" : value)
            }
          >
            <SelectTrigger id={`${idPrefix}-kind`} className="w-full">
              <SelectValue placeholder="Not set">
                {(value: string) => kindLabel(value)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_KIND}>Not set</SelectItem>
              {DISCOUNT_CODE_KINDS.map((kind) => (
                <SelectItem key={kind.value} value={kind.value}>
                  {kind.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>
            Rental codes given to registrants count as rental subsidies.
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-value`}>Value ($)</FieldLabel>
          <Input
            id={`${idPrefix}-value`}
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={details.value}
            onChange={(event) => update("value", event.target.value)}
          />
          <FieldDescription>
            What one code is worth to the person who gets it.
          </FieldDescription>
        </Field>
      </Field>
    </>
  );
}
