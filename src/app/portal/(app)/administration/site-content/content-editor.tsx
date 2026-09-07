"use client";

import { FormEvent, MouseEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { EyeOff } from "lucide-react";
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
import { ContentOutline } from "./content-outline";
import { ContentSectionCard } from "./content-section-card";
import { slotControlId, slotFieldId } from "./content-slot-field";
import { resetSiteContentAction, saveSiteContentAction } from "./actions";

export type { EditorSlot } from "./content-shared";

function initialValues(slots: EditorSlot[]): Record<string, unknown> {
  return Object.fromEntries(slots.map(({ slot, value }) => [slot.key, value]));
}

/**
 * The Site Content editor: one page of the public site at a time, with a rail
 * that can reach the other twelve.
 *
 * Replaces a flat list of eighty-six one-slot cards under a page-pill strip
 * and a Save button that scrolled away with the top of the form (#792). The
 * shell changed; the content model did not.
 */
export function ContentEditor({
  page,
  pages,
  sections,
  slots,
  outline,
  hiddenPages,
  canEdit,
}: {
  page: ContentPage;
  pages: readonly ContentPage[];
  sections: readonly ContentSection[];
  slots: EditorSlot[];
  /** Every slot on every page, so the rail can search across all of them. */
  outline: readonly OutlineEntry[];
  hiddenPages: readonly string[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    initialValues(slots),
  );
  const [error, setError] = useState<string | null>(null);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  // Bumped whenever a value is replaced from outside the field that owns it,
  // so the keyed list and document editors reseed from the new value.
  const [resetToken, setResetToken] = useState(0);
  const [isPending, startTransition] = useTransition();

  const initial = new Map(slots.map(({ slot, value }) => [slot.key, value]));
  const changed = slots
    .map(({ slot }) => slot.key)
    .filter(
      (key) => JSON.stringify(values[key]) !== JSON.stringify(initial.get(key)),
    );
  const dirtyKeys = new Set(changed);

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

  function handleJump(slotKey: string) {
    document
      .getElementById(slotFieldId(slotKey))
      ?.scrollIntoView({ block: "start" });
    // A `list` or `document` slot has no single control to land on.
    document.getElementById(slotControlId(slotKey))?.focus();
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

  function handleDiscard() {
    setError(null);
    setValues(initialValues(slots));
    setResetToken((token) => token + 1);
  }

  function handleReset(slotKey: string) {
    const slot = slots.find((entry) => entry.slot.key === slotKey)?.slot;
    if (!slot) return;
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
          setResetToken((token) => token + 1);
          router.refresh();
        },
      });
    });
  }

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
                  slots={sectionSlots}
                  values={values}
                  initial={initial}
                  dirtyKeys={dirtyKeys}
                  canEdit={canEdit}
                  isPending={isPending}
                  resetToken={resetToken}
                  onChange={setValue}
                  onReset={handleReset}
                />
              );
            })}

            {canEdit && (
              // Sticky, because the longest page is 2,500px of form and the
              // only control that commits used to sit above all of it (#792).
              <div className="rainbow-surface sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--line)] p-4 shadow-md">
                <p className="app-muted text-sm" aria-live="polite">
                  {changed.length === 0
                    ? "No unsaved changes."
                    : `${changed.length} unsaved change${
                        changed.length === 1 ? "" : "s"
                      }.`}
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={isPending || changed.length === 0}
                    onClick={handleDiscard}
                  >
                    Discard
                  </Button>
                  <Button
                    type="submit"
                    disabled={isPending || changed.length === 0}
                  >
                    {isPending ? (
                      <>
                        <Spinner /> Saving...
                      </>
                    ) : (
                      "Save changes"
                    )}
                  </Button>
                </div>
              </div>
            )}
          </form>
        </div>
      </div>

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
