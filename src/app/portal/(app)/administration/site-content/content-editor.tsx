"use client";

import { FormEvent, MouseEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { EyeOff, Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { runAction } from "@/components/portal/action-toast";
import {
  DiscardChangesDialog,
  useUnsavedChangesGuard,
} from "@/components/portal/unsaved-changes-guard";
import type { ContentPage, ContentSection } from "@/lib/site-content";
import type { EditorSlot, OutlineEntry } from "./content-shared";
import { draftValueFor, slotChanges } from "./content-diff";
import { ContentOutline } from "./content-outline";
import { ContentSectionCard } from "./content-section-card";
import { slotControlId, slotFieldId } from "./content-slot-field";
import { PublishChangesDialog } from "./publish-changes-dialog";
import {
  discardSiteContentDraftAction,
  publishSiteContentAction,
  saveSiteContentDraftAction,
} from "./actions";

export type { EditorSlot } from "./content-shared";

function initialValues(slots: EditorSlot[]): Record<string, unknown> {
  return Object.fromEntries(slots.map(({ slot, value }) => [slot.key, value]));
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * The Site Content editor: one page of the public site at a time, with a rail
 * that can reach the other twelve.
 *
 * Saving and publishing are two gestures now (#793). Save stores a draft that
 * only this page can see; Publish moves it onto the public site, after showing
 * exactly which words change. Nothing else about the shell #792 built has
 * moved.
 */
export function ContentEditor({
  page,
  pages,
  sections,
  slots,
  outline,
  hiddenPages,
  programsFromModule,
  canEdit,
}: {
  page: ContentPage;
  pages: readonly ContentPage[];
  sections: readonly ContentSection[];
  slots: EditorSlot[];
  /** Every slot on every page, so the rail can search across all of them. */
  outline: readonly OutlineEntry[];
  hiddenPages: readonly string[];
  /**
   * Whether this tenant's Programs page reads the Programs module rather than
   * the copy below (#898). Only `programs:items` is affected: the heading,
   * the introduction and the pillars are read in both modes.
   */
  programsFromModule: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    initialValues(slots),
  );
  const [error, setError] = useState<string | null>(null);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  // The slots the publish dialog is open for: the whole page, or just one.
  const [publishing, setPublishing] = useState<string[] | null>(null);
  // Bumped whenever a value is replaced from outside the field that owns it,
  // so the keyed list and document editors reseed from the new value.
  const [resetToken, setResetToken] = useState(0);
  const [isPending, startTransition] = useTransition();

  const initial = new Map(slots.map(({ slot, value }) => [slot.key, value]));
  const changed = slots
    .map(({ slot }) => slot.key)
    .filter((key) => !same(values[key], initial.get(key)));
  const dirtyKeys = new Set(changed);

  // Saved but not published: what a visitor to the site still is not seeing.
  const draftKeys = new Set(
    slots.filter((entry) => entry.hasDraft).map((entry) => entry.slot.key),
  );
  const unpublished = new Set([...draftKeys, ...changed]);

  // Switching page unmounts this form, so an unsaved edit used to disappear
  // with no prompt and no way back. A saved draft survives the navigation, so
  // only the unsaved edits are worth interrupting for (#791).
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

  function handleJump(slotKey: string) {
    document
      .getElementById(slotFieldId(slotKey))
      ?.scrollIntoView({ block: "start" });
    // A `list` or `document` slot has no single control to land on.
    document.getElementById(slotControlId(slotKey))?.focus();
  }

  /** The staged writes for the keys the editor has changed. */
  function draftWrites(keys: readonly string[]) {
    return keys.map((key) => {
      const slot = slots.find((entry) => entry.slot.key === key)!.slot;
      return { key, value: draftValueFor(slot, values[key]) };
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      await runAction(() => saveSiteContentDraftAction(draftWrites(changed)), {
        success: `${page.label} draft saved. Publish it when you are ready.`,
        onError: setError,
        onSuccess: () => router.refresh(),
      });
    });
  }

  function handlePublish(keys: string[]) {
    setError(null);
    startTransition(async () => {
      // Publishing what is on screen, not what was last saved: an unsaved edit
      // is staged first so the diff the dialog showed is the diff that lands.
      const unsaved = keys.filter((key) => dirtyKeys.has(key));
      if (unsaved.length > 0) {
        const staged = await runAction(
          () => saveSiteContentDraftAction(draftWrites(unsaved)),
          { success: "Draft saved.", onError: setError },
        );
        if (!staged.ok) return;
      }
      await runAction(() => publishSiteContentAction(keys), {
        success:
          keys.length === 1
            ? "Published."
            : `${keys.length} changes published.`,
        onError: setError,
        onSuccess: () => {
          setPublishing(null);
          router.refresh();
        },
      });
    });
  }

  function handleDiscard() {
    setError(null);
    const staged = [...draftKeys];
    setValues(initialValues(slots));
    setResetToken((token) => token + 1);
    if (staged.length === 0) return;
    startTransition(async () => {
      await runAction(() => discardSiteContentDraftAction(staged), {
        success: "Unpublished changes discarded.",
        onError: setError,
        onSuccess: () => router.refresh(),
      });
    });
  }

  /** "Back to default" is local now: the revert is staged, then published. */
  function handleReset(slotKey: string) {
    const slot = slots.find((entry) => entry.slot.key === slotKey)?.slot;
    if (!slot) return;
    setError(null);
    setValue(slot.key, slot.default);
    setResetToken((token) => token + 1);
  }

  const publishKeys = publishing ?? [];
  const publishChanges = slotChanges(
    slots
      .filter((entry) => publishKeys.includes(entry.slot.key))
      .map((entry) => ({
        slot: entry.slot,
        value: values[entry.slot.key],
        published: entry.published,
      })),
  );

  const hidden = hiddenPages.includes(page.key);

  return (
    <>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
        <ContentOutline
          page={page}
          pages={pages}
          sections={sections}
          outline={outline}
          hiddenPages={hiddenPages}
          dirtyKeys={dirtyKeys}
          unpublishedKeys={unpublished}
          onJump={handleJump}
          onPageLink={handlePageLink}
        />

        <div className="min-w-0">
          {hidden && (
            <Alert className="mb-6">
              <EyeOff />
              <AlertDescription>
                {page.label} is hidden from the public site, so nothing written
                here is visible yet.{" "}
                <Link
                  href="/portal/administration/system-settings"
                  className="underline underline-offset-4"
                >
                  Change that in System Settings
                </Link>
                .
              </AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert variant="destructive" className="mb-6">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {sections.map((section) => {
              const sectionSlots = slots.filter(
                ({ slot }) => slot.section === section.key,
              );
              if (sectionSlots.length === 0) return null;
              return (
                <ContentSectionCard
                  key={section.key}
                  page={page}
                  section={section}
                  notice={
                    programsFromModule && section.key === "programs:items" ? (
                      <Alert>
                        <Info />
                        <AlertDescription>
                          The Programs page is set to list the programs from the
                          Programs module, so this list is not what visitors
                          see.{" "}
                          <Link
                            href="/portal/programs"
                            className="underline underline-offset-4"
                          >
                            Edit those in Programs
                          </Link>
                          , or change where the page reads from in{" "}
                          <Link
                            href="/portal/administration/system-settings"
                            className="underline underline-offset-4"
                          >
                            System Settings
                          </Link>
                          .
                        </AlertDescription>
                      </Alert>
                    ) : undefined
                  }
                  slots={sectionSlots}
                  values={values}
                  initial={initial}
                  dirtyKeys={dirtyKeys}
                  canEdit={canEdit}
                  isPending={isPending}
                  resetToken={resetToken}
                  onChange={setValue}
                  onReset={handleReset}
                  onPublish={(key) => setPublishing([key])}
                />
              );
            })}

            {canEdit && (
              // Sticky, because the longest page is 2,500px of form and the
              // only control that commits used to sit above all of it (#792).
              <div className="rainbow-surface sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--line)] p-4 shadow-md">
                <p className="app-muted text-sm" aria-live="polite">
                  {statusLine(changed.length, unpublished.size)}
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={isPending || unpublished.size === 0}
                    onClick={handleDiscard}
                  >
                    Discard
                  </Button>
                  <Button
                    type="submit"
                    variant="secondary"
                    disabled={isPending || changed.length === 0}
                  >
                    {isPending ? (
                      <>
                        <Spinner /> Saving...
                      </>
                    ) : (
                      "Save draft"
                    )}
                  </Button>
                  <Button
                    type="button"
                    disabled={isPending || unpublished.size === 0}
                    onClick={() => setPublishing([...unpublished])}
                  >
                    Publish
                  </Button>
                </div>
              </div>
            )}
          </form>
        </div>
      </div>

      <PublishChangesDialog
        open={publishing !== null}
        onOpenChange={(open) => setPublishing(open ? publishing : null)}
        changes={publishChanges}
        pending={isPending}
        onConfirm={() => handlePublish(publishKeys)}
      />

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

/**
 * The two states that now differ: edited but not saved, and saved but not
 * live. They are only worth separating when they disagree.
 */
function statusLine(unsaved: number, unpublished: number): string {
  if (unpublished === 0) return "Everything here is published.";
  const changes = `${unpublished} change${unpublished === 1 ? "" : "s"} not published yet.`;
  return unsaved > 0 && unsaved !== unpublished
    ? `${unsaved} unsaved, ${changes}`
    : changes;
}
