"use client";

import { ArrowDown, ArrowUp, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDeleteButton } from "@/components/portal/confirm-delete-button";
import type { ContentSlot, ListField, ListItem } from "@/lib/site-content";
import {
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
  value,
  onChange,
}: {
  field: ListField;
  id: string;
  value: string | string[];
  onChange: (value: string | string[]) => void;
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
  return (
    <Input
      id={id}
      value={typeof value === "string" ? value : ""}
      onChange={(event) => onChange(event.target.value)}
      required={!field.optional}
    />
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
              return (
                <Field key={field.key}>
                  <FieldLabel htmlFor={id}>
                    {field.label}
                    {field.optional && (
                      <span className="app-muted font-normal"> (optional)</span>
                    )}
                  </FieldLabel>
                  <ListFieldControl
                    field={field}
                    id={id}
                    value={
                      row.value[field.key] ?? (field.kind === "text" ? "" : [])
                    }
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
