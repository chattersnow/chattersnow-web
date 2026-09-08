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
import { formatDateTime } from "@/lib/format";
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
 * a slot nobody has touched. "Not published" is the state #793 adds, and it is
 * the one an editor most needs to see: the words on screen are not the words
 * on the site.
 */
function SlotStatus({
  overridden,
  dirty,
  hasDraft,
}: {
  overridden: boolean;
  dirty: boolean;
  hasDraft: boolean;
}) {
  if (dirty) {
    return (
      <span className="rounded-full bg-[var(--purple-soft)] px-2 py-0.5 text-xs font-medium text-[var(--purple-deep)]">
        Unsaved
      </span>
    );
  }
  if (hasDraft) {
    return (
      <span className="rounded-full bg-[var(--purple-soft)] px-2 py-0.5 text-xs font-medium text-[var(--purple-deep)]">
        Not published
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

/**
 * Who last touched this slot and when.
 *
 * The audit log has recorded every write since the table existed, but nothing
 * on this page said so, and reaching it means leaving the editor and knowing
 * the table name. One line against the field answers the question that was
 * actually being asked: is this copy current, and whose is it (#793)?
 */
function SlotAttribution({
  hasDraft,
  draftUpdatedAt,
  draftUpdatedBy,
  publishedAt,
  publishedBy,
}: {
  hasDraft: boolean;
  draftUpdatedAt: string | null;
  draftUpdatedBy: string | null;
  publishedAt: string | null;
  publishedBy: string | null;
}) {
  const lines: string[] = [];
  if (hasDraft && draftUpdatedAt) {
    lines.push(
      `Draft saved ${formatDateTime(draftUpdatedAt)}${
        draftUpdatedBy ? ` by ${draftUpdatedBy}` : ""
      }`,
    );
  }
  if (publishedAt) {
    lines.push(
      `Published ${formatDateTime(publishedAt)}${
        publishedBy ? ` by ${publishedBy}` : ""
      }`,
    );
  }
  if (lines.length === 0) return null;
  return <FieldDescription>{lines.join(" · ")}</FieldDescription>;
}

export function ContentSlotField({
  slot,
  value,
  initialValue,
  overridden,
  hasDraft,
  publishedAt,
  publishedBy,
  draftUpdatedAt,
  draftUpdatedBy,
  dirty,
  canEdit,
  onChange,
  onReset,
  onPublish,
}: {
  slot: ContentSlot;
  value: unknown;
  /** What the server sent, which decides the control a text slot gets. */
  initialValue: unknown;
  overridden: boolean;
  /** Whether a saved draft is waiting to be published. */
  hasDraft: boolean;
  publishedAt: string | null;
  publishedBy: string | null;
  draftUpdatedAt: string | null;
  draftUpdatedBy: string | null;
  dirty: boolean;
  canEdit: boolean;
  onChange: (value: unknown) => void;
  onReset: () => void;
  /** Publish this slot on its own, rather than the whole page. */
  onPublish: () => void;
}) {
  const controlId = slotControlId(slot.key);
  const route = slotRoute(slot);
  const paragraphs = Array.isArray(value) ? (value as string[]) : [];
  const composite = slot.type === "list" || slot.type === "document";
  // "Back to default" now stages a revert rather than deleting the row, so it
  // is offered whenever the copy on screen is not already the default -- an
  // unsaved edit included.
  const isDefault =
    JSON.stringify(value ?? null) === JSON.stringify(slot.default ?? null);

  const heading = (
    <>
      {slot.label}
      <SlotStatus overridden={overridden} dirty={dirty} hasDraft={hasDraft} />
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

      <SlotAttribution
        hasDraft={hasDraft}
        draftUpdatedAt={draftUpdatedAt}
        draftUpdatedBy={draftUpdatedBy}
        publishedAt={publishedAt}
        publishedBy={publishedBy}
      />

      {canEdit && (!isDefault || hasDraft) && (
        <div className="flex flex-wrap gap-2">
          {!isDefault && slot.type !== "document" && (
            <Button type="button" variant="ghost" size="sm" onClick={onReset}>
              Back to default
            </Button>
          )}
          {(hasDraft || dirty) && (
            <Button type="button" variant="ghost" size="sm" onClick={onPublish}>
              Publish this
            </Button>
          )}
        </div>
      )}
    </Field>
  );
}
