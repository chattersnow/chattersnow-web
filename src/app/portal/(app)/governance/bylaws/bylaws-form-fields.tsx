"use client";

import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export type BylawsFormState = {
  version: string;
  effectiveDate: string;
  amendmentSummary: string;
  externalLink: string;
  bodyText: string;
};

export function emptyBylawsForm(): BylawsFormState {
  return {
    version: "",
    effectiveDate: "",
    amendmentSummary: "",
    externalLink: "",
    bodyText: "",
  };
}

export function BylawsFormFields({
  form,
  update,
  idPrefix,
}: {
  form: BylawsFormState;
  update: <K extends keyof BylawsFormState>(
    key: K,
    value: BylawsFormState[K],
  ) => void;
  idPrefix: string;
}) {
  return (
    <>
      <Field orientation="responsive">
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-version`}>Version</FieldLabel>
          <Input
            id={`${idPrefix}-version`}
            required
            placeholder="e.g. 2024 Restatement, Amendment 3"
            value={form.version}
            onChange={(event) => update("version", event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-effective-date`}>
            Effective date
          </FieldLabel>
          <Input
            id={`${idPrefix}-effective-date`}
            type="date"
            required
            value={form.effectiveDate}
            onChange={(event) => update("effectiveDate", event.target.value)}
          />
        </Field>
      </Field>

      <Field>
        <FieldLabel htmlFor={`${idPrefix}-amendment-summary`}>
          What changed
        </FieldLabel>
        <Textarea
          id={`${idPrefix}-amendment-summary`}
          placeholder="Summary of this amendment (leave blank for the original bylaws)"
          value={form.amendmentSummary}
          onChange={(event) => update("amendmentSummary", event.target.value)}
        />
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
        <FieldLabel htmlFor={`${idPrefix}-body-text`}>Bylaws text</FieldLabel>
        <Textarea
          id={`${idPrefix}-body-text`}
          value={form.bodyText}
          onChange={(event) => update("bodyText", event.target.value)}
        />
      </Field>
    </>
  );
}

export function packBylawsFormData(form: BylawsFormState) {
  const formData = new FormData();
  formData.set("version", form.version);
  formData.set("effectiveDate", form.effectiveDate);
  formData.set("amendmentSummary", form.amendmentSummary);
  formData.set("externalLink", form.externalLink);
  formData.set("bodyText", form.bodyText);
  return formData;
}
