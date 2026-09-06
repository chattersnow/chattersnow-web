"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ExternalLink, Plus, Trash2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { runAction } from "@/components/portal/action-toast";
import type {
  ContentPage,
  ContentSlot,
  LegalDocumentContent,
  ListField,
  ListItem,
} from "@/lib/site-content";
import { resetSiteContentAction, saveSiteContentAction } from "./actions";

export type EditorSlot = {
  slot: ContentSlot;
  value: unknown;
  overridden: boolean;
};

/** Paragraphs travel through a textarea as blank-line-separated blocks. */
function paragraphsToText(paragraphs: string[]): string {
  return paragraphs.join("\n\n");
}

function textToParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function emptyListItem(fields: readonly ListField[]): ListItem {
  return Object.fromEntries(
    fields.map((field) => [field.key, field.kind === "text" ? "" : []]),
  );
}

const EMPTY_DOCUMENT: LegalDocumentContent = {
  title: "",
  last_updated: "",
  summary: [],
  sections: [],
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

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
    return (
      <Textarea
        id={id}
        value={paragraphsToText(Array.isArray(value) ? value : [])}
        onChange={(event) => onChange(textToParagraphs(event.target.value))}
        rows={4}
      />
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

function ListEditor({
  slot,
  items,
  onChange,
}: {
  slot: Extract<ContentSlot, { type: "list" }>;
  items: ListItem[];
  onChange: (items: ListItem[]) => void;
}) {
  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <div
          key={index}
          className="space-y-3 rounded-lg border border-[var(--line)] p-3"
        >
          {slot.fields.map((field) => {
            const id = `${slot.key}-${index}-${field.key}`;
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
                  value={item[field.key] ?? (field.kind === "text" ? "" : [])}
                  onChange={(value) =>
                    onChange(
                      items.map((existing, i) =>
                        i === index
                          ? { ...existing, [field.key]: value }
                          : existing,
                      ),
                    )
                  }
                />
              </Field>
            );
          })}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange(items.filter((_, i) => i !== index))}
          >
            <Trash2 />
            Remove item
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => onChange([...items, emptyListItem(slot.fields)])}
      >
        <Plus />
        Add item
      </Button>
    </div>
  );
}

function DocumentEditor({
  slot,
  doc,
  onChange,
}: {
  slot: ContentSlot;
  doc: LegalDocumentContent | null;
  onChange: (doc: LegalDocumentContent | null) => void;
}) {
  if (!doc) {
    return (
      <div className="space-y-3">
        <p className="app-muted text-sm">
          The platform&apos;s own document is published. Writing your own
          replaces it entirely.
        </p>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => onChange(EMPTY_DOCUMENT)}
        >
          Write your own
        </Button>
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
            The opening the reader sees before the sections. Separate paragraphs
            with a blank line.
          </FieldDescription>
        </Field>
      </FieldGroup>

      <div className="space-y-3">
        <span className="app-eyebrow">Sections</span>
        {doc.sections.map((section, index) => (
          <div
            key={index}
            className="space-y-3 rounded-lg border border-[var(--line)] p-3"
          >
            <Field>
              <FieldLabel htmlFor={`${slot.key}-s${index}-title`}>
                Heading
              </FieldLabel>
              <Input
                id={`${slot.key}-s${index}-title`}
                value={section.title}
                onChange={(event) =>
                  update({
                    sections: doc.sections.map((s, i) =>
                      i === index
                        ? {
                            ...s,
                            title: event.target.value,
                            id:
                              slugify(event.target.value) ||
                              `section-${index + 1}`,
                          }
                        : s,
                    ),
                  })
                }
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${slot.key}-s${index}-body`}>
                Text
              </FieldLabel>
              <Textarea
                id={`${slot.key}-s${index}-body`}
                value={paragraphsToText(section.paragraphs)}
                onChange={(event) =>
                  update({
                    sections: doc.sections.map((s, i) =>
                      i === index
                        ? {
                            ...s,
                            paragraphs: textToParagraphs(event.target.value),
                          }
                        : s,
                    ),
                  })
                }
                rows={6}
              />
            </Field>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                update({ sections: doc.sections.filter((_, i) => i !== index) })
              }
            >
              <Trash2 />
              Remove section
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() =>
            update({
              sections: [
                ...doc.sections,
                {
                  id: `section-${doc.sections.length + 1}`,
                  title: "",
                  paragraphs: [],
                },
              ],
            })
          }
        >
          <Plus />
          Add section
        </Button>
      </div>

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

/**
 * One form per page of the public site (#707 Phase 4). Every slot renders
 * the control its type calls for; Save writes only the slots that changed,
 * and "Back to default" drops a slot's own value so the registry default
 * renders again.
 */
export function ContentEditor({
  page,
  slots,
  canEdit,
}: {
  page: ContentPage;
  slots: EditorSlot[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    Object.fromEntries(slots.map(({ slot, value }) => [slot.key, value])),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const initial = new Map(slots.map(({ slot, value }) => [slot.key, value]));
  const changed = slots
    .map(({ slot }) => slot.key)
    .filter(
      (key) => JSON.stringify(values[key]) !== JSON.stringify(initial.get(key)),
    );

  function setValue(key: string, value: unknown) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    // A document slot returned to "platform document" is a reset, not a
    // value; the rest are writes.
    const resets = changed.filter((key) => values[key] === null);
    const writes = changed
      .filter((key) => values[key] !== null)
      .map((key) => ({ key, value: values[key] }));
    startTransition(async () => {
      for (const key of resets) {
        const outcome = await runAction(() => resetSiteContentAction(key), {
          success: "Content reset.",
          onError: setError,
        });
        if (!outcome.ok) return;
      }
      if (writes.length === 0) {
        router.refresh();
        return;
      }
      await runAction(() => saveSiteContentAction(writes), {
        success: `${page.label} content saved.`,
        onError: setError,
        onSuccess: () => router.refresh(),
      });
    });
  }

  function handleReset(key: string, label: string) {
    setError(null);
    startTransition(async () => {
      await runAction(() => resetSiteContentAction(key), {
        success: `${label} is back to the default.`,
        onError: setError,
        onSuccess: () => router.refresh(),
      });
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={page.route}
          target="_blank"
          rel="noopener noreferrer"
          className="app-muted inline-flex items-center gap-1.5 text-sm underline-offset-4 hover:underline"
        >
          View {page.label} on the site
          <ExternalLink className="size-3.5" aria-hidden />
        </Link>
        {canEdit && (
          <Button type="submit" disabled={isPending || changed.length === 0}>
            {isPending ? (
              <>
                <Spinner /> Saving...
              </>
            ) : changed.length > 0 ? (
              `Save ${changed.length} change${changed.length === 1 ? "" : "s"}`
            ) : (
              "Saved"
            )}
          </Button>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {slots.map(({ slot, overridden }) => {
        const value = values[slot.key];
        const id = `content-${slot.key}`;
        return (
          <Card key={slot.key}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                {slot.label}
                {overridden ? (
                  <Badge variant="secondary">Your text</Badge>
                ) : (
                  <Badge variant="outline">Default</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <fieldset disabled={!canEdit || isPending} className="space-y-3">
                {slot.type === "text" && (
                  <Field>
                    <FieldLabel htmlFor={id} className="sr-only">
                      {slot.label}
                    </FieldLabel>
                    {slot.default.length > 90 ? (
                      <Textarea
                        id={id}
                        value={typeof value === "string" ? value : ""}
                        onChange={(event) =>
                          setValue(slot.key, event.target.value)
                        }
                        rows={3}
                      />
                    ) : (
                      <Input
                        id={id}
                        value={typeof value === "string" ? value : ""}
                        onChange={(event) =>
                          setValue(slot.key, event.target.value)
                        }
                      />
                    )}
                    {slot.description && (
                      <FieldDescription>{slot.description}</FieldDescription>
                    )}
                  </Field>
                )}
                {slot.type === "paragraphs" && (
                  <Field>
                    <FieldLabel htmlFor={id} className="sr-only">
                      {slot.label}
                    </FieldLabel>
                    <Textarea
                      id={id}
                      value={paragraphsToText(
                        Array.isArray(value) ? (value as string[]) : [],
                      )}
                      onChange={(event) =>
                        setValue(slot.key, textToParagraphs(event.target.value))
                      }
                      rows={8}
                    />
                    <FieldDescription>
                      {slot.description ??
                        "Separate paragraphs with a blank line."}
                    </FieldDescription>
                  </Field>
                )}
                {slot.type === "list" && (
                  <>
                    {slot.description && (
                      <p className="app-muted text-sm">{slot.description}</p>
                    )}
                    <ListEditor
                      slot={slot}
                      items={Array.isArray(value) ? (value as ListItem[]) : []}
                      onChange={(items) => setValue(slot.key, items)}
                    />
                  </>
                )}
                {slot.type === "document" && (
                  <>
                    {slot.description && (
                      <p className="app-muted text-sm">{slot.description}</p>
                    )}
                    <DocumentEditor
                      slot={slot}
                      doc={(value as LegalDocumentContent | null) ?? null}
                      onChange={(doc) => setValue(slot.key, doc)}
                    />
                  </>
                )}
                {canEdit && overridden && slot.type !== "document" && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleReset(slot.key, slot.label)}
                  >
                    Back to default
                  </Button>
                )}
              </fieldset>
            </CardContent>
          </Card>
        );
      })}
    </form>
  );
}
