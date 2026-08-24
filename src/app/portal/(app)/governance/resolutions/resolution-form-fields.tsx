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
import { Textarea } from "@/components/ui/textarea";
import type { VoteOutcome } from "./resolution-form";

export type ResolutionFormState = {
  motionText: string;
  voteOutcome: VoteOutcome;
  effectiveDate: string;
  externalLink: string;
  bodyText: string;
};

export function emptyResolutionForm(): ResolutionFormState {
  return {
    motionText: "",
    voteOutcome: "pending",
    effectiveDate: "",
    externalLink: "",
    bodyText: "",
  };
}

export function ResolutionFormFields({
  form,
  update,
  idPrefix,
}: {
  form: ResolutionFormState;
  update: <K extends keyof ResolutionFormState>(
    key: K,
    value: ResolutionFormState[K],
  ) => void;
  idPrefix: string;
}) {
  return (
    <>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-motion-text`}>Motion text</FieldLabel>
        <Textarea
          id={`${idPrefix}-motion-text`}
          required
          value={form.motionText}
          onChange={(event) => update("motionText", event.target.value)}
        />
      </Field>

      <Field orientation="responsive">
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-vote-outcome`}>
            Vote outcome
          </FieldLabel>
          <Select
            value={form.voteOutcome}
            onValueChange={(value) =>
              update("voteOutcome", value as VoteOutcome)
            }
          >
            <SelectTrigger id={`${idPrefix}-vote-outcome`}>
              <SelectValue placeholder="Vote outcome" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="passed">Passed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="tabled">Tabled</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-effective-date`}>
            Effective date
          </FieldLabel>
          <Input
            id={`${idPrefix}-effective-date`}
            type="date"
            value={form.effectiveDate}
            onChange={(event) => update("effectiveDate", event.target.value)}
          />
        </Field>
      </Field>

      <Field>
        <FieldLabel htmlFor={`${idPrefix}-external-link`}>
          External link
        </FieldLabel>
        <Input
          id={`${idPrefix}-external-link`}
          type="url"
          placeholder="https://..."
          value={form.externalLink}
          onChange={(event) => update("externalLink", event.target.value)}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor={`${idPrefix}-body-text`}>
          Resolution text
        </FieldLabel>
        <Textarea
          id={`${idPrefix}-body-text`}
          value={form.bodyText}
          onChange={(event) => update("bodyText", event.target.value)}
        />
      </Field>
    </>
  );
}

export function packResolutionFormData(form: ResolutionFormState) {
  const formData = new FormData();
  formData.set("motionText", form.motionText);
  formData.set("voteOutcome", form.voteOutcome);
  formData.set("effectiveDate", form.effectiveDate);
  formData.set("externalLink", form.externalLink);
  formData.set("bodyText", form.bodyText);
  return formData;
}
