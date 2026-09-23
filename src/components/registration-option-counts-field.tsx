"use client";

import { StatusBadge } from "@/components/portal/status-badge";
import { FieldDescription, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  totalOptionCount,
  type OptionCounts,
  type RegistrationOptionsQuestion,
} from "@/lib/registration-options";

/**
 * An event's registration question (#1407), answered as a count per option
 * that adds up to the party size. Shared by both public registration forms,
 * the registrant's own edit card, and the portal's add-registrant and walk-in
 * dialogs, so the question reads the same wherever it is asked.
 *
 * A full option stays on screen with its count locked at what the reader
 * already holds, so nobody wonders where it went. `allowFull` lifts that for
 * staff, who are not held to caps.
 */
export function RegistrationOptionCountsField({
  idPrefix,
  question,
  counts,
  onChange,
  partySize,
  required = true,
  allowFull = false,
  description = "One per person attending, including you.",
  disabled,
}: {
  idPrefix: string;
  question: RegistrationOptionsQuestion;
  counts: OptionCounts;
  onChange: (counts: OptionCounts) => void;
  /** The party size as typed; not a number yet while somebody is typing. */
  partySize: number;
  required?: boolean;
  allowFull?: boolean;
  description?: string;
  disabled?: boolean;
}) {
  const total = totalOptionCount(counts);
  const target = Number.isInteger(partySize) && partySize > 0 ? partySize : 0;

  return (
    <FieldSet>
      <FieldLegend variant="label">
        {question.prompt}
        {required && (
          <span
            data-slot="field-required"
            aria-hidden="true"
            className="ml-1 text-destructive"
          >
            *
          </span>
        )}
      </FieldLegend>
      <FieldDescription>{description}</FieldDescription>
      <div className="flex flex-col gap-2">
        {question.options.map((option) => {
          const id = `${idPrefix}-option-${option.id}`;
          const current = counts[option.id] ?? 0;
          // Editing an answer: the cap less everybody else's. A new
          // registration: open or full.
          const max = allowFull
            ? undefined
            : option.available !== undefined
              ? (option.available ?? undefined)
              : option.isFull
                ? current
                : undefined;
          // Nothing held and nothing left to take.
          const locked = max === 0 && current === 0;
          return (
            <div key={option.id} className="flex items-center gap-3">
              <Input
                id={id}
                type="number"
                inputMode="numeric"
                min={0}
                max={max}
                step={1}
                className="w-20 shrink-0"
                value={current === 0 ? "" : String(current)}
                placeholder="0"
                disabled={disabled || locked}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  onChange({
                    ...counts,
                    [option.id]: Number.isInteger(next) && next > 0 ? next : 0,
                  });
                }}
              />
              <Label htmlFor={id} className="font-normal">
                {option.label}
              </Label>
              {locked && (
                <StatusBadge tone="neutral" className="shrink-0">
                  Full
                </StatusBadge>
              )}
            </div>
          );
        })}
      </div>
      {target > 0 && (
        <p
          className="app-muted text-sm"
          // Announced as it changes, so a screen reader hears the running
          // total without leaving the inputs.
          aria-live="polite"
        >
          {total === target
            ? `All ${target} ${target === 1 ? "person" : "people"} accounted for.`
            : total < target
              ? `${total} of ${target} chosen.`
              : `${total} chosen — that's more than the ${target} attending.`}
        </p>
      )}
    </FieldSet>
  );
}
