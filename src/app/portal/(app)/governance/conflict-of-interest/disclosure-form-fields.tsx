"use client";

import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export type DisclosureFormState = {
  disclosureYear: string;
  onFileDate: string;
  notes: string;
  externalLink: string;
  bodyText: string;
};

export function emptyDisclosureForm(): DisclosureFormState {
  return {
    disclosureYear: String(new Date().getFullYear()),
    onFileDate: "",
    notes: "",
    externalLink: "",
    bodyText: "",
  };
}

export function DisclosureFormFields({
  form,
  update,
  idPrefix,
}: {
  form: DisclosureFormState;
  update: <K extends keyof DisclosureFormState>(
    key: K,
    value: DisclosureFormState[K],
  ) => void;
  idPrefix: string;
}) {
  return (
    <>
      <Field orientation="responsive">
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-disclosure-year`}>
            Disclosure year
          </FieldLabel>
          <Input
            id={`${idPrefix}-disclosure-year`}
            type="number"
            required
            value={form.disclosureYear}
            onChange={(event) => update("disclosureYear", event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-on-file-date`}>
            On-file date
          </FieldLabel>
          <Input
            id={`${idPrefix}-on-file-date`}
            type="date"
            value={form.onFileDate}
            onChange={(event) => update("onFileDate", event.target.value)}
          />
        </Field>
      </Field>

      <Field>
        <FieldLabel htmlFor={`${idPrefix}-notes`}>Notes</FieldLabel>
        <Textarea
          id={`${idPrefix}-notes`}
          placeholder="Any noted conflicts..."
          value={form.notes}
          onChange={(event) => update("notes", event.target.value)}
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
        <FieldLabel htmlFor={`${idPrefix}-body-text`}>
          Disclosure details
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

export function packDisclosureFormData(form: DisclosureFormState) {
  const formData = new FormData();
  formData.set("disclosureYear", form.disclosureYear);
  formData.set("onFileDate", form.onFileDate);
  formData.set("notes", form.notes);
  formData.set("externalLink", form.externalLink);
  formData.set("bodyText", form.bodyText);
  return formData;
}
