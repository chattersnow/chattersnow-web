"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import type { ContentPage, ContentSection } from "@/lib/site-content";
import type { EditorSlot } from "./content-shared";
import { ContentSlotField, slotRoute } from "./content-slot-field";
import { ImageSlotHint } from "./image-slot-field";

export function sectionCardId(key: string): string {
  return `section-${key}`;
}

/**
 * One card per section rather than per slot.
 *
 * A `Card` with a header, a title and a badge around a single one-line input
 * -- "Events button" holding "Join an event" -- is almost all chrome, and
 * eighty-six of them is what made Get Involved a 2,500px form (#792). The
 * chrome is now paid once per section, and the slots inside it are plain
 * fields in a `FieldGroup`.
 */
export function ContentSectionCard({
  page,
  section,
  slots,
  values,
  initial,
  dirtyKeys,
  canEdit,
  isPending,
  resetToken,
  onChange,
  onReset,
  onPublish,
}: {
  page: ContentPage;
  section: ContentSection;
  slots: EditorSlot[];
  values: Record<string, unknown>;
  initial: Map<string, unknown>;
  dirtyKeys: Set<string>;
  canEdit: boolean;
  isPending: boolean;
  /** Bumped when a value is replaced from outside, to remount keyed editors. */
  resetToken: number;
  onChange: (key: string, value: unknown) => void;
  onReset: (slotKey: string) => void;
  /** Publish this slot alone, rather than everything pending on the page. */
  onPublish: (slotKey: string) => void;
}) {
  // A section whose every slot links to a page of its own -- the legal
  // documents -- leaves nothing for a section-wide link to point at.
  const route = slots.some(({ slot }) => !slotRoute(slot))
    ? (section.route ?? page.route)
    : undefined;
  // Said once here rather than under each photo. The same two sentences under
  // all eight image slots on Get Involved was twenty-four lines of identical
  // grey text at 390px, and the page is long enough already (#918).
  const hasImage = slots.some(({ slot }) => slot.type === "image");

  return (
    <Card id={sectionCardId(section.key)} className="scroll-mt-28">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-3">
          {section.label}
          {route && (
            <Link
              href={route}
              target="_blank"
              rel="noopener noreferrer"
              className="app-muted inline-flex items-center gap-1.5 text-sm font-normal underline-offset-4 hover:underline"
            >
              View on the site
              <span className="sr-only">({section.label})</span>
              <ExternalLink className="size-3.5" aria-hidden />
            </Link>
          )}
        </CardTitle>
        {section.description && (
          <p className="app-muted text-sm">{section.description}</p>
        )}
        {hasImage && <ImageSlotHint />}
      </CardHeader>
      <CardContent>
        <fieldset disabled={!canEdit || isPending}>
          <FieldGroup>
            {slots.map((entry) => {
              const { slot } = entry;
              return (
                <ContentSlotField
                  // Remounted when a value is replaced from outside, so the
                  // keyed list and document editors reseed from it.
                  key={`${slot.key}-${resetToken}`}
                  slot={slot}
                  value={values[slot.key]}
                  initialValue={initial.get(slot.key)}
                  overridden={entry.overridden}
                  hasDraft={entry.hasDraft}
                  publishedAt={entry.publishedAt}
                  publishedBy={entry.publishedBy}
                  draftUpdatedAt={entry.draftUpdatedAt}
                  draftUpdatedBy={entry.draftUpdatedBy}
                  starter={entry.starter}
                  dirty={dirtyKeys.has(slot.key)}
                  canEdit={canEdit}
                  onChange={(value) => onChange(slot.key, value)}
                  onReset={() => onReset(slot.key)}
                  onPublish={() => onPublish(slot.key)}
                />
              );
            })}
          </FieldGroup>
        </fieldset>
      </CardContent>
    </Card>
  );
}
