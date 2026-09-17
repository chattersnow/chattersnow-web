"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export type ActionItemFormState = {
  description: string;
  dueDate: string;
  done: boolean;
};

export function emptyActionItemForm(): ActionItemFormState {
  return {
    description: "",
    dueDate: "",
    done: false,
  };
}

export function ActionItemFormFields({
  form,
  update,
  idPrefix,
}: {
  form: ActionItemFormState;
  update: <K extends keyof ActionItemFormState>(
    key: K,
    value: ActionItemFormState[K],
  ) => void;
  idPrefix: string;
}) {
  return (
    <>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-description`} required>
          Description
        </FieldLabel>
        <Textarea
          id={`${idPrefix}-description`}
          required
          value={form.description}
          onChange={(event) => update("description", event.target.value)}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor={`${idPrefix}-due-date`}>Due date</FieldLabel>
        <Input
          id={`${idPrefix}-due-date`}
          type="date"
          value={form.dueDate}
          onChange={(event) => update("dueDate", event.target.value)}
        />
      </Field>

      <Field>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={form.done}
            onCheckedChange={(checked) => update("done", checked === true)}
          />
          Done
        </label>
      </Field>
    </>
  );
}

/**
 * `minutesItemKey` names the minutes item the action was raised under (#1199),
 * which only the Minutes tab knows. Set only when there is one: `parseActionItemForm`
 * treats an empty value as absent, and `updateActionItemAction` spreads the
 * parsed object into its update, so sending a blank from the Action items tab
 * would quietly unlink an item somebody grouped under a section.
 */
export function packActionItemFormData(
  form: ActionItemFormState,
  minutesItemKey?: string,
) {
  const formData = new FormData();
  formData.set("description", form.description);
  formData.set("dueDate", form.dueDate);
  formData.set("status", form.done ? "done" : "open");
  if (minutesItemKey) formData.set("minutesItemKey", minutesItemKey);
  return formData;
}
