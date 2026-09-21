"use client";

import { useState } from "react";
import { CircleHelp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useLexicon } from "@/components/lexicon-context";
import { applyLexicon } from "@/lib/lexicon";
import {
  LEVEL_HAS_NO_EFFECT,
  permissionDocFor,
  type PermissionDoc,
} from "@/lib/auth/permission-docs";
import type { PermissionLevel } from "@/lib/auth/permissions";
import { navPlacementsForResource } from "@/lib/portal/nav";

/**
 * One resource of the permission catalog, explained (#1324).
 *
 * Rendered twice from one definition: inline on the permission reference page,
 * and inside a sheet opened from a row of the permissions matrix, which is
 * where the question is actually asked. The prose comes from
 * `src/lib/auth/permission-docs.ts`; everything about where a grant shows up is
 * derived from the nav tree rather than retyped, so it cannot drift.
 */
export type PermissionResourceRow = {
  key: string;
  section: string;
  label: string;
  description: string | null;
  module_key?: string | null;
};

/** A role in this organization that currently holds the resource. */
export type PermissionHolder = { role: string; level: PermissionLevel };

const LEVEL_LABELS: Record<PermissionLevel, string> = {
  none: "None",
  view: "View",
  manage: "Manage",
};

/**
 * The field headings sit under whatever names the resource, and that differs
 * between the two hosts: the sheet's title is an h2, the reference page's
 * resource heading is an h3. Passing the level rather than hardcoding one
 * keeps the outline unbroken -- a skipped level is an axe `heading-order`
 * violation, and `bun run test:a11y:check` is a gate.
 */
function Field({
  heading,
  level,
  children,
}: {
  heading: string;
  level: 3 | 4;
  children: React.ReactNode;
}) {
  const Heading = level === 3 ? "h3" : "h4";
  return (
    <section className="space-y-1.5">
      <Heading className="app-eyebrow text-xs">{heading}</Heading>
      {children}
    </section>
  );
}

function LevelBlock({
  level,
  prose,
}: {
  level: Exclude<PermissionLevel, "none">;
  prose: string | null;
}) {
  return (
    <div className="rounded-lg border border-[var(--line)] p-3">
      <div className="flex items-center gap-2">
        <Badge variant={prose ? "default" : "secondary"}>
          {LEVEL_LABELS[level]}
        </Badge>
        {level === "manage" && (
          <span className="app-muted text-xs">includes everything in View</span>
        )}
      </div>
      <p className={`mt-2 text-sm ${prose ? "" : "app-muted italic"}`}>
        {prose ?? LEVEL_HAS_NO_EFFECT}
      </p>
    </div>
  );
}

export function PermissionResourceDoc({
  resource,
  holders,
  moduleLabel,
  moduleEnabled = true,
  onSelectResource,
  resourceLabels,
  headingLevel = 3,
}: {
  resource: PermissionResourceRow;
  /** Roles in this organization holding it, at View or Manage. */
  holders: readonly PermissionHolder[];
  /** The human name of `resource.module_key`, when it could be read. */
  moduleLabel?: string | null;
  moduleEnabled?: boolean;
  /**
   * Called when a "does not include" cross-reference is followed. Omit to
   * render the cross-references as plain text, which is what the reference
   * page does -- every resource is already on the page.
   */
  onSelectResource?: (key: string) => void;
  /** key -> label, so a cross-reference can name the other resource. */
  resourceLabels: Readonly<Record<string, string>>;
  /** The level the field headings take; see `Field`. */
  headingLevel?: 3 | 4;
}) {
  const lexicon = useLexicon();
  const doc: PermissionDoc | undefined = permissionDocFor(resource.key);
  const placements = navPlacementsForResource(resource.key);

  return (
    <div className="space-y-5">
      <Field level={headingLevel} heading="Identity">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="app-muted">Key</dt>
          <dd className="font-mono text-xs">{resource.key}</dd>
          <dt className="app-muted">Section</dt>
          <dd>{resource.section}</dd>
          {resource.module_key && (
            <>
              <dt className="app-muted">Module</dt>
              <dd>
                {moduleLabel ?? resource.module_key}
                {!moduleEnabled && (
                  <span className="app-muted">
                    {" "}
                    — this grant is inert while that module is off
                  </span>
                )}
              </dd>
            </>
          )}
        </dl>
        {resource.description && (
          <p className="app-muted text-sm">{resource.description}</p>
        )}
      </Field>

      {doc ? (
        <Field level={headingLevel} heading="What each level grants">
          <div className="space-y-2">
            <LevelBlock level="view" prose={doc.view} />
            <LevelBlock level="manage" prose={doc.manage} />
          </div>
        </Field>
      ) : (
        // permission-docs.test.ts makes this unreachable in a shipped build;
        // it is here so a resource added mid-branch renders rather than throws.
        <p className="app-muted text-sm italic">
          This resource has no written explanation yet.
        </p>
      )}

      <Field level={headingLevel} heading="Where it shows up">
        {placements.length > 0 ? (
          <ul className="space-y-1 text-sm">
            {placements.map((placement) => (
              <li key={`${placement.href}:${placement.level}`}>
                {applyLexicon(placement.label, lexicon)}{" "}
                <span className="app-muted text-xs">
                  (from {LEVEL_LABELS[placement.level]})
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="app-muted text-sm">
            No sidebar entry of its own. It widens what pages and actions
            elsewhere allow, so granting it adds no new destination.
          </p>
        )}
      </Field>

      {doc?.excludes && doc.excludes.length > 0 && (
        <Field level={headingLevel} heading="What it does not include">
          <ul className="space-y-1 text-sm">
            {doc.excludes.map((exclusion) => {
              const label = resourceLabels[exclusion.key] ?? exclusion.key;
              return (
                <li key={exclusion.key}>
                  {onSelectResource ? (
                    <button
                      type="button"
                      className="rounded-sm font-medium underline underline-offset-2 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                      onClick={() => onSelectResource(exclusion.key)}
                    >
                      {label}
                    </button>
                  ) : (
                    <span className="font-medium">{label}</span>
                  )}{" "}
                  <span className="app-muted">covers {exclusion.covers}.</span>
                </li>
              );
            })}
          </ul>
        </Field>
      )}

      {doc?.notes && doc.notes.length > 0 && (
        <Field level={headingLevel} heading="Before you grant it">
          <ul className="app-muted list-disc space-y-1 pl-5 text-sm">
            {doc.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </Field>
      )}

      <Field level={headingLevel} heading="Who holds it here">
        {holders.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {holders.map((holder) => (
              <li key={`${holder.role}:${holder.level}`}>
                <Badge variant="secondary">
                  {holder.role} · {LEVEL_LABELS[holder.level]}
                </Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="app-muted text-sm">
            No role in this organization holds it.
          </p>
        )}
      </Field>
    </div>
  );
}

/**
 * The same explanation, opened from a row of the permissions matrix.
 *
 * A sheet rather than a dialog, matching `role-details-dialog.tsx`: this is
 * reference material read *while* deciding a cell, so it belongs beside the
 * table rather than on top of it. A "does not include" link swaps the sheet to
 * that resource instead of closing and reopening, because the question is
 * almost always "then which one do I grant?".
 */
export function PermissionResourceSheet({
  resource,
  resources,
  holdersByResource,
  moduleLabels,
  triggerLabel,
}: {
  /** The row the sheet opens on. */
  resource: PermissionResourceRow;
  /** The whole catalog, so a cross-reference can be followed within the sheet. */
  resources: readonly PermissionResourceRow[];
  holdersByResource: Readonly<Record<string, readonly PermissionHolder[]>>;
  moduleLabels?: Readonly<Record<string, string>>;
  /** Accessible name of the trigger, which is an icon button. */
  triggerLabel: string;
}) {
  const [shownKey, setShownKey] = useState(resource.key);
  const [open, setOpen] = useState(false);

  const byKey = new Map(resources.map((entry) => [entry.key, entry]));
  const resourceLabels = Object.fromEntries(
    resources.map((entry) => [entry.key, entry.label]),
  );
  const shown = byKey.get(shownKey) ?? resource;

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    // Reopening after following a cross-reference should start from this
    // row again, not from wherever the last read wandered to.
    if (!nextOpen) setShownKey(resource.key);
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-7"
        aria-label={triggerLabel}
        onClick={() => handleOpenChange(true)}
      >
        <CircleHelp className="size-4" />
      </Button>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent side="right" size="lg">
          <SheetHeader>
            <SheetTitle>{shown.label}</SheetTitle>
            <SheetDescription>
              What this permission grants, and what it does not.
            </SheetDescription>
          </SheetHeader>
          {/* A tab stop of its own, like the portal help sheet: the body is
              prose, so without one a keyboard user reads the first screenful
              and can go no further. */}
          <div
            tabIndex={0}
            role="region"
            aria-label="Permission details"
            className="flex-1 overflow-y-auto px-4 pb-6 outline-none focus-visible:ring-3 focus-visible:ring-ring"
          >
            <PermissionResourceDoc
              resource={shown}
              holders={holdersByResource[shown.key] ?? []}
              moduleLabel={
                shown.module_key
                  ? (moduleLabels?.[shown.module_key] ?? null)
                  : null
              }
              onSelectResource={(key) => {
                if (byKey.has(key)) setShownKey(key);
              }}
              resourceLabels={resourceLabels}
            />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
