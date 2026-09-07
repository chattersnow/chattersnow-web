"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type {
  ContentSlot,
  LegalDocumentContent,
  ListItem,
} from "@/lib/site-content";
import {
  isMultiline,
  paragraphHint,
  paragraphsToText,
  textToParagraphs,
} from "./content-values";
import { DocumentEditor } from "./document-editor";
import { ListEditor } from "./list-editor";

/** The slot's control, for the label to point at. */
export function slotControlId(key: string): string {
  return `content-${key}`;
}

/**
 * The slot's whole field, which is what the rail scrolls to. A `list` or
 * `document` slot has many controls and no single one to land on.
 */
export function slotFieldId(key: string): string {
  return `field-${key}`;
}

/**
 * Where this slot renders, for the slots that own a page of their own. Only
 * the legal documents do: the `legal` section holds three of them, so a single
 * link for the whole section was right for one document and wrong for the
 * other two (#791).
 */
export function slotRoute(slot: ContentSlot): string | undefined {
  return slot.type === "document" ? slot.route : undefined;
}

/**
 * The state of one slot, said in words rather than in colour.
 *
 * Every slot used to carry a "Default" or "Your text" badge in a card header
 * of its own, which is most of what made eighty-six fields three thousand
 * pixels tall. Default is now the silent case -- there is nothing to say about
 * a slot nobody has touched.
 */
function SlotStatus({
  overridden,
  dirty,
}: {
  overridden: boolean;
  dirty: boolean;
}) {
  if (dirty) {
    return (
      <span className="rounded-full bg-[var(--purple-soft)] px-2 py-0.5 text-xs font-medium text-[var(--purple-deep)]">
        Unsaved
      </span>
    );
  }
  if (overridden) {
    return (
      <span className="app-muted rounded-full border border-[var(--line)] px-2 py-0.5 text-xs font-normal">
        Your text
      </span>
    );
  }
  return null;
}

export function ContentSlotField({
  slot,
  value,
  initialValue,
  overridden,
  dirty,
  canEdit,
  onChange,
  onReset,
}: {
  slot: ContentSlot;
  value: unknown;
  /** What the server sent, which decides the control a text slot gets. */
  initialValue: unknown;
  overridden: boolean;
  dirty: boolean;
  canEdit: boolean;
  onChange: (value: unknown) => void;
  onReset: () => void;
}) {
  const controlId = slotControlId(slot.key);
  const route = slotRoute(slot);
  const paragraphs = Array.isArray(value) ? (value as string[]) : [];
  const composite = slot.type === "list" || slot.type === "document";

  const heading = (
    <>
      {slot.label}
      <SlotStatus overridden={overridden} dirty={dirty} />
      {route && (
        <Link
          href={route}
          target="_blank"
          rel="noopener noreferrer"
          className="app-muted inline-flex items-center gap-1.5 text-sm font-normal underline-offset-4 hover:underline"
        >
          View on the site
          <ExternalLink className="size-3.5" aria-hidden />
        </Link>
      )}
    </>
  );

  return (
    <Field id={slotFieldId(slot.key)} className="scroll-mt-32">
      {composite ? (
        <FieldTitle className="flex flex-wrap items-center gap-2">
          {heading}
        </FieldTitle>
      ) : (
        <FieldLabel
          htmlFor={controlId}
          className="flex flex-wrap items-center gap-2"
        >
          {heading}
        </FieldLabel>
      )}

      {slot.type === "text" &&
        (isMultiline(slot, initialValue) ? (
          <Textarea
            id={controlId}
            value={typeof value === "string" ? value : ""}
            onChange={(event) => onChange(event.target.value)}
            rows={3}
          />
        ) : (
          <Input
            id={controlId}
            value={typeof value === "string" ? value : ""}
            onChange={(event) => onChange(event.target.value)}
          />
        ))}

      {slot.type === "paragraphs" && (
        <Textarea
          id={controlId}
          value={paragraphsToText(paragraphs)}
          onChange={(event) => onChange(textToParagraphs(event.target.value))}
          rows={8}
        />
      )}

      {slot.description && (
        <FieldDescription>{slot.description}</FieldDescription>
      )}
      {slot.type === "paragraphs" && (
        <FieldDescription>{paragraphHint(paragraphs)}</FieldDescription>
      )}

      {slot.type === "list" && (
        <ListEditor
          slot={slot}
          items={Array.isArray(value) ? (value as ListItem[]) : []}
          onChange={onChange}
        />
      )}

      {slot.type === "document" && (
        <DocumentEditor
          slot={slot}
          doc={(value as LegalDocumentContent | null) ?? null}
          onChange={onChange}
        />
      )}

      {canEdit && overridden && slot.type !== "document" && (
        <div>
          <Button type="button" variant="ghost" size="sm" onClick={onReset}>
            Back to default
          </Button>
        </div>
      )}
    </Field>
  );
}
