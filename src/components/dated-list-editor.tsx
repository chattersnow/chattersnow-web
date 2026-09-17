"use client";

import { Link2Off, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export type DatedListItem = {
  date: string;
  description: string;
  owner: string;
  /**
   * Set on a row copied from a record rather than typed (#1223). The three
   * fields above stay editable either way -- the description is a copy, and
   * whoever writes the agenda may reword it -- so the link is what says where
   * the row came from, and dropping it leaves the text behind.
   */
  source_kind?: "event" | "calendar_item";
  source_id?: string;
};

type DatedListEditorProps = {
  label?: string;
  items: DatedListItem[];
  onChange: (items: DatedListItem[]) => void;
  /**
   * Titles for linked rows, keyed `${source_kind}:${source_id}`. Supplied by
   * whatever is showing the live list beside this editor; a row whose record
   * has since moved out of that list keeps its link and reads generically
   * rather than losing it.
   */
  sourceTitles?: Record<string, string>;
};

export function DatedListEditor({
  label = "Upcoming dates",
  items,
  onChange,
  sourceTitles,
}: DatedListEditorProps) {
  function updateItem(index: number, patch: Partial<DatedListItem>) {
    onChange(
      items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  }
  function removeItem(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }
  function unlinkItem(index: number) {
    onChange(
      items.map((item, i) => {
        if (i !== index) return item;
        const { source_kind: _kind, source_id: _id, ...rest } = item;
        return rest;
      }),
    );
  }

  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <div className="flex flex-col gap-2">
        {items.map((item, index) => {
          const linked = item.source_kind && item.source_id;
          const title = linked
            ? (sourceTitles?.[`${item.source_kind}:${item.source_id}`] ??
              (item.source_kind === "event" ? "an event" : "a calendar item"))
            : null;

          return (
            <div
              key={index}
              className="flex flex-col gap-2 rounded-md border border-[var(--line)] p-2"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
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

              {title && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="app-muted text-xs">Linked to {title}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-auto p-0 text-xs"
                    aria-label={`Unlink ${title}`}
                    onClick={() => unlinkItem(index)}
                  >
                    <Link2Off /> Unlink
                  </Button>
                </div>
              )}
            </div>
          );
        })}
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
