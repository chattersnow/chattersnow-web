"use client";

import { useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";

/**
 * Inline edit-in-place for one user's preferred name, mirroring the "Add
 * role" control in the same table rather than introducing a form/modal for a
 * single optional text field.
 */
export function PreferredNameCell({
  value,
  label,
  disabled,
  onSave,
}: {
  value: string | null;
  /** Name of the user being edited, for the accessible control labels. */
  label: string;
  disabled: boolean;
  onSave: (preferredName: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");

  function start() {
    setDraft(value ?? "");
    setIsEditing(true);
  }

  function cancel() {
    setDraft(value ?? "");
    setIsEditing(false);
  }

  function save() {
    onSave(draft);
    setIsEditing(false);
  }

  if (!isEditing) {
    return (
      <div className="flex items-center gap-1">
        <span className={value ? undefined : "app-muted"}>{value ?? "—"}</span>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                disabled={disabled}
                onClick={start}
                aria-label={`Edit preferred name for ${label}`}
              />
            }
          >
            <Pencil className="size-3.5" />
          </TooltipTrigger>
          <TooltipContent>{`Edit preferred name for ${label}`}</TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Input
        autoFocus
        value={draft}
        disabled={disabled}
        aria-label={`Preferred name for ${label}`}
        placeholder="Preferred name"
        className="h-8 w-40"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            save();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            cancel();
          }
        }}
      />
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              disabled={disabled}
              onClick={save}
              aria-label={`Save preferred name for ${label}`}
            />
          }
        >
          <Check className="size-3.5" />
        </TooltipTrigger>
        <TooltipContent>{`Save preferred name for ${label}`}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              disabled={disabled}
              onClick={cancel}
              aria-label={`Cancel editing preferred name for ${label}`}
            />
          }
        >
          <X className="size-3.5" />
        </TooltipTrigger>
        <TooltipContent>{`Cancel editing preferred name for ${label}`}</TooltipContent>
      </Tooltip>
    </div>
  );
}
