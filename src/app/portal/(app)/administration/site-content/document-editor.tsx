"use client";

import { ArrowDown, ArrowUp, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDeleteButton } from "@/components/portal/confirm-delete-button";
import {
  LEGAL_DOCUMENT_OUTLINES,
  type ContentSlot,
  type LegalDocumentContent,
  type LegalDocumentSection,
} from "@/lib/site-content";
import {
  paragraphHint,
  paragraphsToText,
  slugify,
  textToParagraphs,
} from "./content-values";
import { useKeyedRows } from "./use-keyed-rows";

const EMPTY_DOCUMENT: LegalDocumentContent = {
  title: "",
  last_updated: "",
  summary: [],
  sections: [],
};

/** The date format the platform's own documents print. */
function today(): string {
  return new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * The platform document's title and headings, with none of its text.
 *
 * Nobody drafts a privacy policy from nothing, and "Write your own" seeded an
 * empty box (#792). This was the starting point offered while the platform's
 * prose was Chatter Snow's and could not honestly be copied; since #858 it is
 * the fallback for a document slot the server could not build a starter for.
 */
function outlineDocument(slotKey: string): LegalDocumentContent {
  const outline = LEGAL_DOCUMENT_OUTLINES[slotKey];
  if (!outline) return { ...EMPTY_DOCUMENT, last_updated: today() };
  return {
    title: outline.title,
    last_updated: today(),
    summary: [],
    sections: outline.sections.map((section) => ({
      ...section,
      paragraphs: [],
    })),
  };
}

function SectionsEditor({
  slot,
  sections,
  onChange,
}: {
  slot: ContentSlot;
  sections: LegalDocumentSection[];
  onChange: (sections: LegalDocumentSection[]) => void;
}) {
  const rows = useKeyedRows(sections, onChange);

  return (
    <div className="space-y-3">
      <span className="app-eyebrow">Sections</span>
      {rows.rows.map((row, index) => {
        const name = row.value.title.trim() || `Section ${index + 1}`;
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
                  description="This removes the section and everything written in it from the published document once you save. It cannot be undone."
                  confirmLabel="Remove"
                  onConfirm={() => rows.remove(row.id)}
                />
              </div>
            </div>
            <Field>
              <FieldLabel htmlFor={`${slot.key}-${row.id}-title`}>
                Heading
              </FieldLabel>
              <Input
                id={`${slot.key}-${row.id}-title`}
                value={row.value.title}
                onChange={(event) =>
                  rows.update(row.id, {
                    ...row.value,
                    title: event.target.value,
                    // The heading is also the anchor the section nav links to.
                    id: slugify(event.target.value) || `section-${index + 1}`,
                  })
                }
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${slot.key}-${row.id}-body`}>
                Text
              </FieldLabel>
              <Textarea
                id={`${slot.key}-${row.id}-body`}
                value={paragraphsToText(row.value.paragraphs)}
                onChange={(event) =>
                  rows.update(row.id, {
                    ...row.value,
                    paragraphs: textToParagraphs(event.target.value),
                  })
                }
                rows={6}
              />
              <FieldDescription>
                {paragraphHint(row.value.paragraphs)}
              </FieldDescription>
            </Field>
          </div>
        );
      })}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() =>
          rows.add({
            id: `section-${rows.rows.length + 1}`,
            title: "",
            paragraphs: [],
          })
        }
      >
        <Plus />
        Add section
      </Button>
    </div>
  );
}

export function DocumentEditor({
  slot,
  doc,
  starter,
  onChange,
}: {
  slot: ContentSlot;
  doc: LegalDocumentContent | null;
  /**
   * The platform's document for this slot, named for this organization -- what
   * the public site serves while nothing of the tenant's own is published, and
   * what "start from" copies into the editor (#858).
   */
  starter: LegalDocumentContent | null;
  onChange: (doc: LegalDocumentContent | null) => void;
}) {
  if (!doc) {
    return (
      <div className="space-y-3">
        <p className="app-muted text-sm">
          The platform&apos;s own document is published. Writing your own
          replaces it entirely.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() =>
              onChange(
                starter
                  ? { ...starter, last_updated: today() }
                  : outlineDocument(slot.key),
              )
            }
          >
            Start from the platform document
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              onChange({ ...EMPTY_DOCUMENT, last_updated: today() })
            }
          >
            Start blank
          </Button>
        </div>
        <p className="app-muted text-xs">
          The platform document is a neutral starting point, not legal advice:
          it describes what this site does with the information people give it,
          and leaves everything only your organization can answer to you. Have
          your own legal counsel review whatever you publish here.
        </p>
      </div>
    );
  }

  const update = (patch: Partial<LegalDocumentContent>) =>
    onChange({ ...doc, ...patch });

  return (
    <div className="space-y-4">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={`${slot.key}-title`}>Title</FieldLabel>
          <Input
            id={`${slot.key}-title`}
            value={doc.title}
            onChange={(event) => update({ title: event.target.value })}
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${slot.key}-updated`}>Last updated</FieldLabel>
          <Input
            id={`${slot.key}-updated`}
            value={doc.last_updated}
            placeholder="September 6, 2026"
            onChange={(event) => update({ last_updated: event.target.value })}
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${slot.key}-summary`}>Short version</FieldLabel>
          <Textarea
            id={`${slot.key}-summary`}
            value={paragraphsToText(doc.summary)}
            onChange={(event) =>
              update({ summary: textToParagraphs(event.target.value) })
            }
            rows={4}
          />
          <FieldDescription>
            The opening the reader sees before the sections.{" "}
            {paragraphHint(doc.summary)}
          </FieldDescription>
        </Field>
      </FieldGroup>

      <SectionsEditor
        slot={slot}
        sections={doc.sections}
        onChange={(sections) => update({ sections })}
      />

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => onChange(null)}
      >
        Use the platform document instead
      </Button>
    </div>
  );
}
