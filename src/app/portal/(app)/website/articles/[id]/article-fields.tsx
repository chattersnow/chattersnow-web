"use client";

import { ArrowDown, ArrowUp, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDeleteButton } from "@/components/portal/confirm-delete-button";
import type { ArticleBody, ArticleLink, ArticleListItem } from "@/lib/articles";
import {
  paragraphHint,
  paragraphsToText,
  textToParagraphs,
} from "../../content-values";
import { useKeyedRows } from "../../use-keyed-rows";

/**
 * The two repeatable parts of an article body -- the labelled list and the
 * further-reading links.
 *
 * Both are `useKeyedRows` for the reason #792 introduced it: held as plain
 * arrays keyed by index, removing or moving a row shifted every key below it
 * and React reused the wrong input for the wrong row, so focus and caret
 * landed somewhere else. An id that belongs to the row rather than to its
 * position is also what makes reordering possible at all.
 */
function RowFrame({
  name,
  index,
  count,
  what,
  onMove,
  onRemove,
  children,
}: {
  name: string;
  index: number;
  count: number;
  /** "point" or "link", for the confirmation wording. */
  what: string;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-[var(--line)] p-3">
      <div className="flex items-start justify-between gap-2">
        <span className="app-eyebrow">{name}</span>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Move ${name} up`}
            disabled={index === 0}
            onClick={() => onMove(-1)}
          >
            <ArrowUp />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Move ${name} down`}
            disabled={index === count - 1}
            onClick={() => onMove(1)}
          >
            <ArrowDown />
          </Button>
          <ConfirmDeleteButton
            label={`Remove ${name}`}
            title={`Remove ${name}?`}
            description={`This removes the ${what} from the article once you save and publish. It cannot be undone.`}
            confirmLabel="Remove"
            onConfirm={onRemove}
          />
        </div>
      </div>
      {children}
    </div>
  );
}

function ListEditor({
  idPrefix,
  items,
  onChange,
}: {
  idPrefix: string;
  items: ArticleListItem[];
  onChange: (items: ArticleListItem[]) => void;
}) {
  const rows = useKeyedRows(items, onChange);

  return (
    <div className="space-y-3">
      {rows.rows.map((row, index) => {
        const name = row.value.label.trim() || `Point ${index + 1}`;
        return (
          <RowFrame
            key={row.id}
            name={name}
            index={index}
            count={rows.rows.length}
            what="point"
            onMove={(direction) => rows.move(row.id, direction)}
            onRemove={() => rows.remove(row.id)}
          >
            <Field>
              <FieldLabel htmlFor={`${idPrefix}-${row.id}-label`}>
                Label
              </FieldLabel>
              <Input
                id={`${idPrefix}-${row.id}-label`}
                value={row.value.label}
                onChange={(event) =>
                  rows.update(row.id, {
                    ...row.value,
                    label: event.target.value,
                  })
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${idPrefix}-${row.id}-text`}>
                Text
              </FieldLabel>
              <Textarea
                id={`${idPrefix}-${row.id}-text`}
                value={row.value.text}
                rows={2}
                onChange={(event) =>
                  rows.update(row.id, {
                    ...row.value,
                    text: event.target.value,
                  })
                }
              />
            </Field>
          </RowFrame>
        );
      })}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => rows.add({ label: "", text: "" })}
      >
        <Plus />
        Add point
      </Button>
    </div>
  );
}

function LinkEditor({
  idPrefix,
  links,
  onChange,
}: {
  idPrefix: string;
  links: ArticleLink[];
  onChange: (links: ArticleLink[]) => void;
}) {
  const rows = useKeyedRows(links, onChange);

  return (
    <div className="space-y-3">
      {rows.rows.map((row, index) => {
        const name = row.value.label.trim() || `Link ${index + 1}`;
        return (
          <RowFrame
            key={row.id}
            name={name}
            index={index}
            count={rows.rows.length}
            what="link"
            onMove={(direction) => rows.move(row.id, direction)}
            onRemove={() => rows.remove(row.id)}
          >
            <Field>
              <FieldLabel htmlFor={`${idPrefix}-${row.id}-label`}>
                Label
              </FieldLabel>
              <Input
                id={`${idPrefix}-${row.id}-label`}
                value={row.value.label}
                onChange={(event) =>
                  rows.update(row.id, {
                    ...row.value,
                    label: event.target.value,
                  })
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${idPrefix}-${row.id}-href`}>
                Address
              </FieldLabel>
              <Input
                id={`${idPrefix}-${row.id}-href`}
                value={row.value.href}
                placeholder="https://example.org/ or /programs"
                onChange={(event) =>
                  rows.update(row.id, {
                    ...row.value,
                    href: event.target.value,
                  })
                }
              />
            </Field>
            <Field orientation="horizontal">
              <Checkbox
                id={`${idPrefix}-${row.id}-internal`}
                checked={Boolean(row.value.internal)}
                onCheckedChange={(checked) =>
                  rows.update(row.id, {
                    ...row.value,
                    internal: Boolean(checked),
                  })
                }
              />
              <FieldLabel htmlFor={`${idPrefix}-${row.id}-internal`}>
                Points somewhere on this site
              </FieldLabel>
            </Field>
            <FieldDescription>
              A link marked as internal is hidden automatically when the section
              it points at is switched off, so it never sends a reader to a 404.
            </FieldDescription>
          </RowFrame>
        );
      })}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => rows.add({ label: "", href: "" })}
      >
        <Plus />
        Add link
      </Button>
    </div>
  );
}

/** Every field of one article body. */
export function ArticleFields({
  idPrefix,
  body,
  onChange,
}: {
  idPrefix: string;
  body: ArticleBody;
  onChange: (body: ArticleBody) => void;
}) {
  function set<K extends keyof ArticleBody>(key: K, value: ArticleBody[K]) {
    onChange({ ...body, [key]: value });
  }

  return (
    <div className="space-y-4">
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-description`}>
          Introduction
        </FieldLabel>
        <Textarea
          id={`${idPrefix}-description`}
          value={body.description}
          rows={3}
          onChange={(event) => set("description", event.target.value)}
        />
        <FieldDescription>
          The sentence under the article&rsquo;s heading, before the points.
        </FieldDescription>
      </Field>

      <Field>
        {/* FieldTitle rather than FieldLabel: this names a group of rows, not
            one control, and a label pointing at no input is an a11y fault. */}
        <FieldTitle>Points</FieldTitle>
        <ListEditor
          idPrefix={`${idPrefix}-list`}
          items={body.list}
          onChange={(list) => set("list", list)}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor={`${idPrefix}-paragraphs`}>Body</FieldLabel>
        <Textarea
          id={`${idPrefix}-paragraphs`}
          value={paragraphsToText(body.paragraphs)}
          rows={8}
          onChange={(event) =>
            set("paragraphs", textToParagraphs(event.target.value))
          }
        />
        <FieldDescription>{paragraphHint(body.paragraphs)}</FieldDescription>
      </Field>

      <Field>
        <FieldTitle>Further reading</FieldTitle>
        <LinkEditor
          idPrefix={`${idPrefix}-links`}
          links={body.links}
          onChange={(links) => set("links", links)}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor={`${idPrefix}-disclaimer`}>Disclaimer</FieldLabel>
        <Textarea
          id={`${idPrefix}-disclaimer`}
          value={body.disclaimer}
          rows={2}
          onChange={(event) => set("disclaimer", event.target.value)}
        />
        <FieldDescription>
          The small print under the article. Left blank, nothing renders.
        </FieldDescription>
      </Field>
    </div>
  );
}
