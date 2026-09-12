"use client";

import { ArrowDown, ArrowUp, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDeleteButton } from "@/components/portal/confirm-delete-button";
import { isPublishableHref } from "@/lib/legal-markup";
import type { ContentSlot, ListField, ListItem } from "@/lib/site-content";
import {
  emptyFieldValue,
  emptyListItem,
  listItemLabel,
  paragraphHint,
  paragraphsToText,
  textToParagraphs,
} from "./content-values";
import { useKeyedRows } from "./use-keyed-rows";

function ListFieldControl({
  field,
  id,
  labelId,
  value,
  onChange,
}: {
  field: ListField;
  id: string;
  labelId: string;
  value: string | string[] | boolean;
  onChange: (value: string | string[] | boolean) => void;
}) {
  if (field.kind === "paragraphs") {
    const paragraphs = Array.isArray(value) ? value : [];
    return (
      <>
        <Textarea
          id={id}
          value={paragraphsToText(paragraphs)}
          onChange={(event) => onChange(textToParagraphs(event.target.value))}
          rows={4}
        />
        <FieldDescription>{paragraphHint(paragraphs)}</FieldDescription>
      </>
    );
  }
  // `aria-labelledby` rather than the Field's `htmlFor`: the switch renders a
  // button, and a label pointing at one by id is what the rest of the portal's
  // switch rows do (page-visibility-panel.tsx, notifications-panel.tsx).
  if (field.kind === "boolean") {
    return (
      <Switch
        checked={value !== false}
        onCheckedChange={(checked) => onChange(checked)}
        aria-labelledby={labelId}
      />
    );
  }
  const text = typeof value === "string" ? value : "";
  return (
    <>
      <Input
        id={id}
        // Deliberately not `type="url"`, even though this is one: the browser's
        // own URL validation demands a scheme, and `/events` -- a page on this
        // site, which is most of what these links are -- is exactly what it
        // would reject. The hint below says the same thing in the terms this
        // field actually accepts.
        inputMode={field.kind === "url" ? "url" : undefined}
        value={text}
        onChange={(event) => onChange(event.target.value)}
        required={!field.optional}
      />
      {field.kind === "url" && text !== "" && !isPublishableHref(text) && (
        <FieldDescription className="text-destructive">
          Use a full https:// address, a page on this site starting with /, or a
          mailto: address.
        </FieldDescription>
      )}
    </>
  );
}

/**
 * The editor for a `list` slot -- Values, Pillars, Programs, Accepted items,
 * Sponsorship tiers.
 *
 * Order is meaningful in every one of those and used to be unreachable: items
 * could only be appended and removed, so correcting an order meant retyping
 * everything below the mistake. Removal fired on a single click with no
 * confirmation and no undo (#792).
 */
export function ListEditor({
  slot,
  items,
  onChange,
}: {
  slot: Extract<ContentSlot, { type: "list" }>;
  items: ListItem[];
  onChange: (items: ListItem[]) => void;
}) {
  const rows = useKeyedRows(items, onChange);

  return (
    <div className="space-y-3">
      {rows.rows.map((row, index) => {
        const name = listItemLabel(row.value, slot.fields, index);
        return (
          <div
            key={row.id}
            className="space-y-3 rounded-lg border border-[var(--line)] p-3"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="app-eyebrow">{name}</span>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Move ${name} up`}
                  disabled={index === 0}
                  onClick={() => rows.move(row.id, -1)}
                >
                  <ArrowUp />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Move ${name} down`}
                  disabled={index === rows.rows.length - 1}
                  onClick={() => rows.move(row.id, 1)}
                >
                  <ArrowDown />
                </Button>
                <ConfirmDeleteButton
                  label={`Remove ${name}`}
                  title={`Remove ${name}?`}
                  description={`This removes it from ${slot.label} on the public site once you save. It cannot be undone.`}
                  confirmLabel="Remove"
                  onConfirm={() => rows.remove(row.id)}
                />
              </div>
            </div>
            {slot.fields.map((field) => {
              const id = `${slot.key}-${row.id}-${field.key}`;
              const labelId = `${id}-label`;
              // A switch reads as a setting, not as a box to fill in, so its
              // label sits beside it rather than above it.
              const isSwitch = field.kind === "boolean";
              return (
                <Field
                  key={field.key}
                  className={
                    isSwitch
                      ? "flex-row items-center justify-between"
                      : undefined
                  }
                >
                  <FieldLabel id={labelId} htmlFor={isSwitch ? undefined : id}>
                    {field.label}
                    {field.optional && (
                      <span className="app-muted font-normal"> (optional)</span>
                    )}
                  </FieldLabel>
                  <ListFieldControl
                    field={field}
                    id={id}
                    labelId={labelId}
                    value={row.value[field.key] ?? emptyFieldValue(field)}
                    onChange={(value) =>
                      rows.update(row.id, { ...row.value, [field.key]: value })
                    }
                  />
                </Field>
              );
            })}
          </div>
        );
      })}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => rows.add(emptyListItem(slot.fields))}
      >
        <Plus />
        Add item
      </Button>
    </div>
  );
}
