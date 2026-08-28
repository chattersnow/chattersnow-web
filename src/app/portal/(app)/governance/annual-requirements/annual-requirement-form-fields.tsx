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
import type { RequirementStatus } from "./annual-requirement-form";

export type AnnualRequirementFormState = {
  name: string;
  dueDate: string;
  status: RequirementStatus;
  externalLink: string;
  bodyText: string;
};

export function emptyAnnualRequirementForm(): AnnualRequirementFormState {
  return {
    name: "",
    dueDate: "",
    status: "not_started",
    externalLink: "",
    bodyText: "",
  };
}

export function AnnualRequirementFormFields({
  form,
  update,
  idPrefix,
}: {
  form: AnnualRequirementFormState;
  update: <K extends keyof AnnualRequirementFormState>(
    key: K,
    value: AnnualRequirementFormState[K],
  ) => void;
  idPrefix: string;
}) {
  return (
    <>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-name`}>Name</FieldLabel>
        <Input
          id={`${idPrefix}-name`}
          required
          placeholder="e.g. IRS Form 990"
          value={form.name}
          onChange={(event) => update("name", event.target.value)}
        />
      </Field>

      <Field orientation="responsive">
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-due-date`}>Due date</FieldLabel>
          <Input
            id={`${idPrefix}-due-date`}
            type="date"
            required
            value={form.dueDate}
            onChange={(event) => update("dueDate", event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-status`}>Status</FieldLabel>
          <Select
            value={form.status}
            onValueChange={(value) =>
              update("status", value as RequirementStatus)
            }
          >
            <SelectTrigger id={`${idPrefix}-status`}>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="not_started">Not started</SelectItem>
              <SelectItem value="in_progress">In progress</SelectItem>
              <SelectItem value="done">Done</SelectItem>
            </SelectContent>
          </Select>
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
        <FieldLabel htmlFor={`${idPrefix}-body-text`}>Notes</FieldLabel>
        <Textarea
          id={`${idPrefix}-body-text`}
          value={form.bodyText}
          onChange={(event) => update("bodyText", event.target.value)}
        />
      </Field>
    </>
  );
}

export function packAnnualRequirementFormData(
  form: AnnualRequirementFormState,
) {
  const formData = new FormData();
  formData.set("name", form.name);
  formData.set("dueDate", form.dueDate);
  formData.set("status", form.status);
  formData.set("externalLink", form.externalLink);
  formData.set("bodyText", form.bodyText);
  return formData;
}
