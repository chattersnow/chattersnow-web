"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export type DatedListItem = {
  date: string;
  description: string;
  owner: string;
};

type DatedListEditorProps = {
  label?: string;
  items: DatedListItem[];
  onChange: (items: DatedListItem[]) => void;
};

export function DatedListEditor({
  label = "Upcoming dates",
  items,
  onChange,
}: DatedListEditorProps) {
  function updateItem(index: number, patch: Partial<DatedListItem>) {
    onChange(
      items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  }
  function removeItem(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <div className="flex flex-col gap-2">
        {items.map((item, index) => (
          <div
            key={index}
            className="flex flex-col gap-2 rounded-md border border-[var(--line)] p-2 sm:flex-row sm:items-center"
          >
            <Input
              type="date"
              className="sm:w-40"
              value={item.date}
              onChange={(event) =>
                updateItem(index, { date: event.target.value })
              }
            />
            <Input
              placeholder="Event / deadline"
              value={item.description}
              onChange={(event) =>
                updateItem(index, { description: event.target.value })
              }
            />
            <Input
              placeholder="Owner"
              className="sm:w-40"
              value={item.owner}
              onChange={(event) =>
                updateItem(index, { owner: event.target.value })
              }
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Remove upcoming date"
              onClick={() => removeItem(index)}
            >
              <Trash2 />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() =>
            onChange([...items, { date: "", description: "", owner: "" }])
          }
        >
          <Plus /> Add date
        </Button>
      </div>
    </Field>
  );
}
