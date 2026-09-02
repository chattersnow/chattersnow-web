"use client";

import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export type PolicyFormState = {
  name: string;
  category: string;
  effectiveDate: string;
  version: string;
  externalLink: string;
  bodyText: string;
};

export function emptyPolicyForm(): PolicyFormState {
  return {
    name: "",
    category: "",
    effectiveDate: "",
    version: "",
    externalLink: "",
    bodyText: "",
  };
}

export function PolicyFormFields({
  form,
  update,
  idPrefix,
}: {
  form: PolicyFormState;
  update: <K extends keyof PolicyFormState>(
    key: K,
    value: PolicyFormState[K],
  ) => void;
  idPrefix: string;
}) {
  return (
    <>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-name`}>Policy name</FieldLabel>
        <Input
          id={`${idPrefix}-name`}
          required
          placeholder="e.g. Whistleblower Policy"
          value={form.name}
          onChange={(event) => update("name", event.target.value)}
        />
      </Field>

      <Field orientation="responsive">
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-category`}>Category</FieldLabel>
          <Input
            id={`${idPrefix}-category`}
            placeholder="e.g. Compliance"
            value={form.category}
            onChange={(event) => update("category", event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-version`}>Version</FieldLabel>
          <Input
            id={`${idPrefix}-version`}
            required
            placeholder="e.g. 1, 2024 revision"
            value={form.version}
            onChange={(event) => update("version", event.target.value)}
          />
        </Field>
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
        <FieldLabel htmlFor={`${idPrefix}-body-text`}>Policy text</FieldLabel>
        <Textarea
          id={`${idPrefix}-body-text`}
          value={form.bodyText}
          onChange={(event) => update("bodyText", event.target.value)}
        />
      </Field>
    </>
  );
}

export function packPolicyFormData(form: PolicyFormState) {
  const formData = new FormData();
  formData.set("name", form.name);
  formData.set("category", form.category);
  formData.set("version", form.version);
  formData.set("effectiveDate", form.effectiveDate);
  formData.set("externalLink", form.externalLink);
  formData.set("bodyText", form.bodyText);
  return formData;
}
