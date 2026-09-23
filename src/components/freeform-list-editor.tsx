"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type FreeformListEditorProps = {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
};

export function FreeformListEditor({
  label,
  items,
  onChange,
}: FreeformListEditorProps) {
  function updateItem(index: number, value: string) {
    onChange(items.map((item, i) => (i === index ? value : item)));
  }
  function removeItem(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <div className="flex flex-col gap-2">
        {items.map((item, index) => (
          <div key={index} className="flex items-center gap-2">
            <Input
              value={item}
              onChange={(event) => updateItem(index, event.target.value)}
            />
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${label.toLowerCase()} item`}
                    onClick={() => removeItem(index)}
                  />
                }
              >
                <Trash2 />
              </TooltipTrigger>
              <TooltipContent>Remove {label.toLowerCase()} item</TooltipContent>
            </Tooltip>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => onChange([...items, ""])}
        >
          <Plus /> Add
        </Button>
      </div>
    </Field>
  );
}
