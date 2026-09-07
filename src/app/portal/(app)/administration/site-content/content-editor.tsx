"use client";

import { FormEvent, MouseEvent, useState, useTransition } from "react";
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
import {
  DiscardChangesDialog,
  useUnsavedChangesGuard,
} from "@/components/portal/unsaved-changes-guard";
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

/**
 * Where this slot renders on the public site, for slots that own a page of
 * their own. Only the legal documents do: the `legal` tab holds three of
 * them, so a single link for the whole tab was right for one document and
 * wrong for the other two (#791).
 */
function slotRoute(slot: ContentSlot): string | undefined {
  return slot.type === "document" ? slot.route : undefined;
}

/**
 * Whether a text slot needs more than one line. Decided from the longer of
 * the registry default and the value the server sent, never from what is
 * being typed -- swapping the control mid-edit would drop the caret. Looking
 * at the default alone left a tenant whose own copy is long editing it in a
 * single-line input forever (#791).
 */
function isMultiline(
  slot: Extract<ContentSlot, { type: "text" }>,
  initialValue: unknown,
): boolean {
  const longest = Math.max(
    slot.default.length,
    typeof initialValue === "string" ? initialValue.length : 0,
  );
  return longest > 90;
}

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
  pages,
  slots,
  canEdit,
}: {
  page: ContentPage;
  pages: readonly ContentPage[];
  slots: EditorSlot[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    Object.fromEntries(slots.map(({ slot, value }) => [slot.key, value])),
  );
  const [error, setError] = useState<string | null>(null);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const initial = new Map(slots.map(({ slot, value }) => [slot.key, value]));
  const changed = slots
    .map(({ slot }) => slot.key)
    .filter(
      (key) => JSON.stringify(values[key]) !== JSON.stringify(initial.get(key)),
    );

  // Switching page unmounts this form, so an unsaved edit used to disappear
  // with no prompt and no way back. The guard also covers a refresh or a tab
  // close, neither of which asked before (#791).
  const guard = useUnsavedChangesGuard(canEdit && changed.length > 0);

  function setValue(key: string, value: unknown) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function handlePageLink(
    event: MouseEvent<HTMLAnchorElement>,
    href: string,
  ): void {
    // A modified click opens a new tab and leaves this form alone, so only a
    // plain left click is worth interrupting.
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    if (guard.allowOpenChange(false)) return;
    event.preventDefault();
    setPendingHref(href);
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

  function handleReset(slot: ContentSlot) {
    setError(null);
    startTransition(async () => {
      await runAction(() => resetSiteContentAction(slot.key), {
        success: `${slot.label} is back to the default.`,
        onError: setError,
        onSuccess: () => {
          // The row is gone, so the site serves the registry default again.
          // Leaving the old text in the field showed words that were no
          // longer published and armed Save to write them straight back
          // (#791).
          setValue(slot.key, slot.default);
          router.refresh();
        },
      });
    });
  }

  // Every slot on the legal tab links to its own page, which leaves nothing
  // for a single page-wide link to point at.
  const showPageLink = slots.some(({ slot }) => !slotRoute(slot));

  return (
    <>
      <nav aria-label="Pages" className="mb-6 flex flex-wrap gap-2">
        {pages.map((candidate) => {
          const href = `/portal/administration/site-content?page=${candidate.key}`;
          return (
            <Button
              key={candidate.key}
              size="sm"
              variant={candidate.key === page.key ? "default" : "secondary"}
              nativeButton={false}
              render={
                <Link
                  href={href}
                  aria-current={candidate.key === page.key ? "page" : undefined}
                  onClick={(event) => handlePageLink(event, href)}
                />
              }
            >
              {candidate.label}
            </Button>
          );
        })}
      </nav>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {showPageLink ? (
            <Link
              href={page.route}
              target="_blank"
              rel="noopener noreferrer"
              className="app-muted inline-flex items-center gap-1.5 text-sm underline-offset-4 hover:underline"
            >
              View {page.label} on the site
              <ExternalLink className="size-3.5" aria-hidden />
            </Link>
          ) : (
            <span />
          )}
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
          const initialValue = initial.get(slot.key);
          const route = slotRoute(slot);
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
                </CardTitle>
              </CardHeader>
              <CardContent>
                <fieldset
                  disabled={!canEdit || isPending}
                  className="space-y-3"
                >
                  {slot.type === "text" && (
                    <Field>
                      <FieldLabel htmlFor={id} className="sr-only">
                        {slot.label}
                      </FieldLabel>
                      {isMultiline(slot, initialValue) ? (
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
                          setValue(
                            slot.key,
                            textToParagraphs(event.target.value),
                          )
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
                        items={
                          Array.isArray(value) ? (value as ListItem[]) : []
                        }
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
                      onClick={() => handleReset(slot)}
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

      <DiscardChangesDialog
        guard={guard}
        subject={`the ${page.label} content`}
        onDiscard={() => {
          if (pendingHref) router.push(pendingHref);
          setPendingHref(null);
        }}
      />
    </>
  );
}
