"use client";

import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { TemplateField } from "../content-brief-template-shared";

export function TemplateFieldsEditor({
  fields,
  onChange,
}: {
  fields: TemplateField[];
  onChange: (fields: TemplateField[]) => void;
}) {
  function updateField(index: number, patch: Partial<TemplateField>) {
    onChange(
      fields.map((field, i) => (i === index ? { ...field, ...patch } : field)),
    );
  }

  function removeField(index: number) {
    onChange(fields.filter((_, i) => i !== index));
  }

  function moveField(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= fields.length) return;
    const next = [...fields];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  function addField() {
    onChange([...fields, { key: "", label: "", help_text: null }]);
  }

  return (
    <div className="flex flex-col gap-3">
      {fields.map((field, index) => (
        <div
          key={index}
          className="flex flex-col gap-2 rounded-lg border border-border p-3"
        >
          <div className="flex items-start gap-2">
            <div className="flex flex-1 flex-col gap-2">
              <Field orientation="responsive">
                <Field>
                  <FieldLabel htmlFor={`field-key-${index}`}>
                    Field key
                  </FieldLabel>
                  <Input
                    id={`field-key-${index}`}
                    placeholder="e.g. quote"
                    value={field.key}
                    onChange={(event) =>
                      updateField(index, { key: event.target.value })
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`field-label-${index}`}>
                    Label
                  </FieldLabel>
                  <Input
                    id={`field-label-${index}`}
                    placeholder="e.g. Quote"
                    value={field.label}
                    onChange={(event) =>
                      updateField(index, { label: event.target.value })
                    }
                  />
                </Field>
              </Field>
              <Field>
                <FieldLabel htmlFor={`field-help-${index}`}>
                  Help text (optional)
                </FieldLabel>
                <Input
                  id={`field-help-${index}`}
                  value={field.help_text ?? ""}
                  onChange={(event) =>
                    updateField(index, {
                      help_text: event.target.value || null,
                    })
                  }
                />
              </Field>
            </div>
            <div className="flex flex-col gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Move field up"
                disabled={index === 0}
                onClick={() => moveField(index, -1)}
              >
                <ChevronUp />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Move field down"
                disabled={index === fields.length - 1}
                onClick={() => moveField(index, 1)}
              >
                <ChevronDown />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Remove field"
                onClick={() => removeField(index)}
              >
                <Trash2 />
              </Button>
            </div>
          </div>
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        onClick={addField}
      >
        <Plus /> Add field
      </Button>
    </div>
  );
}
