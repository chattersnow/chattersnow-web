"use client";

import {
  Field,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DISCOUNT_CODE_KINDS } from "@/lib/portal/impact-metrics";
import { formatCurrency } from "@/lib/format";
import { PERCENT_OFF_FIELD_PREFIX } from "./discount-codes-form";
import type { CoverableOption } from "./use-coverable-options";

export type DiscountCodeDetailsState = {
  description: string;
  source: string;
  kind: string;
  value: string;
  /** Option id -> percent off, as typed; blank is not covered (#1589). */
  coverage: Record<string, string>;
};

export function emptyDiscountCodeDetails(): DiscountCodeDetailsState {
  return { description: "", source: "", kind: "", value: "", coverage: {} };
}

export function setDiscountCodeDetails(
  formData: FormData,
  details: DiscountCodeDetailsState,
) {
  formData.set("description", details.description);
  formData.set("source", details.source);
  formData.set("kind", details.kind);
  formData.set("value", details.value);
  for (const [optionId, percent] of Object.entries(details.coverage)) {
    formData.set(`${PERCENT_OFF_FIELD_PREFIX}${optionId}`, percent);
  }
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
 *
 * Below them, the event's registration options with a percentage off beside
 * each (#1589): with the options' prices, that is what the discount value a
 * code offers is derived from. Shown only where the event has options.
 */
export function DiscountCodeDetailFields({
  idPrefix,
  details,
  onChange,
  options = [],
}: {
  idPrefix: string;
  details: DiscountCodeDetailsState;
  onChange: (details: DiscountCodeDetailsState) => void;
  options?: CoverableOption[];
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
            What one code is worth to the person who gets it. Used only where
            the options below can&apos;t value it.
          </FieldDescription>
        </Field>
      </Field>

      {options.length > 0 && (
        <FieldSet>
          <FieldLegend variant="label">Covers</FieldLegend>
          <FieldDescription>
            The percentage off each registration option this code gives. A
            bundled option is discounted on its whole price. Leave blank for
            options it doesn&apos;t cover.
          </FieldDescription>
          <ul className="flex flex-col gap-2">
            {options.map((option) => (
              <li key={option.id} className="flex items-center gap-3">
                <FieldLabel
                  htmlFor={`${idPrefix}-percent-${option.id}`}
                  className="min-w-0 flex-1 font-normal"
                >
                  <span className="min-w-0 break-words">
                    {option.label}
                    <span className="app-muted block text-xs">
                      {option.price === null
                        ? "No price set"
                        : formatCurrency(option.price)}
                    </span>
                  </span>
                </FieldLabel>
                <div className="flex w-28 shrink-0 items-center gap-1">
                  <Input
                    id={`${idPrefix}-percent-${option.id}`}
                    type="number"
                    min="0.01"
                    max="100"
                    step="0.01"
                    inputMode="decimal"
                    placeholder="—"
                    value={details.coverage[option.id] ?? ""}
                    onChange={(event) =>
                      onChange({
                        ...details,
                        coverage: {
                          ...details.coverage,
                          [option.id]: event.target.value,
                        },
                      })
                    }
                  />
                  <span className="app-muted text-sm" aria-hidden="true">
                    %
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </FieldSet>
      )}
    </>
  );
}
