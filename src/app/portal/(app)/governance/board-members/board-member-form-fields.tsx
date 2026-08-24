"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export type BoardMemberFormState = {
  roleTitle: string;
  termStart: string;
  termEnd: string;
  isActive: boolean;
  notes: string;
};

export function emptyBoardMemberForm(): BoardMemberFormState {
  return {
    roleTitle: "",
    termStart: "",
    termEnd: "",
    isActive: true,
    notes: "",
  };
}

export function BoardMemberFormFields({
  form,
  update,
  idPrefix,
}: {
  form: BoardMemberFormState;
  update: <K extends keyof BoardMemberFormState>(
    key: K,
    value: BoardMemberFormState[K],
  ) => void;
  idPrefix: string;
}) {
  return (
    <>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-role-title`}>Role / title</FieldLabel>
        <Input
          id={`${idPrefix}-role-title`}
          required
          placeholder="e.g. President, Treasurer, At-Large"
          value={form.roleTitle}
          onChange={(event) => update("roleTitle", event.target.value)}
        />
      </Field>

      <Field orientation="responsive">
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-term-start`}>Term start</FieldLabel>
          <Input
            id={`${idPrefix}-term-start`}
            type="date"
            required
            value={form.termStart}
            onChange={(event) => update("termStart", event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-term-end`}>Term end</FieldLabel>
          <Input
            id={`${idPrefix}-term-end`}
            type="date"
            value={form.termEnd}
            onChange={(event) => update("termEnd", event.target.value)}
          />
        </Field>
      </Field>

      <Field>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={form.isActive}
            onCheckedChange={(checked) => update("isActive", checked === true)}
          />
          Active term
        </label>
      </Field>

      <Field>
        <FieldLabel htmlFor={`${idPrefix}-notes`}>Notes</FieldLabel>
        <Textarea
          id={`${idPrefix}-notes`}
          value={form.notes}
          onChange={(event) => update("notes", event.target.value)}
        />
      </Field>
    </>
  );
}

export function packBoardMemberFormData(form: BoardMemberFormState) {
  const formData = new FormData();
  formData.set("roleTitle", form.roleTitle);
  formData.set("termStart", form.termStart);
  formData.set("termEnd", form.termEnd);
  formData.set("isActive", String(form.isActive));
  formData.set("notes", form.notes);
  return formData;
}
