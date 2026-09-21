"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { DeviceClass } from "@/proxy";
import {
  PermissionResourceDoc,
  type PermissionHolder,
  type PermissionResourceRow,
} from "@/components/portal/permission-resource-doc";
import { PermissionReferenceRail } from "./permission-reference-rail";

/** The id of the card a rail row jumps to. */
function cardId(key: string): string {
  return `resource-${key}`;
}

/**
 * Which resource the reader is looking at, for the rail's `aria-current` and
 * for the label on its collapsed button.
 *
 * An observer rather than a scroll listener: the cards are tall, several are
 * on screen at once, and what matters is which one owns the top of the
 * viewport. The root margin pins the decision to a band just under the portal
 * header, so a card counts as "current" from the moment its heading reaches
 * the top rather than when the whole card is visible.
 */
function useActiveResource(keys: readonly string[]): string | null {
  const [active, setActive] = useState<string | null>(keys[0] ?? null);

  useEffect(() => {
    const cards = keys
      .map((key) => document.getElementById(cardId(key)))
      .filter((element): element is HTMLElement => element !== null);
    if (cards.length === 0) return;

    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const key = entry.target.id.replace(/^resource-/, "");
          if (entry.isIntersecting) visible.add(key);
          else visible.delete(key);
        }
        // Document order, so the topmost one on screen wins.
        const first = keys.find((key) => visible.has(key));
        if (first) setActive(first);
      },
      { rootMargin: "-20% 0px -70% 0px" },
    );
    for (const card of cards) observer.observe(card);
    return () => observer.disconnect();
  }, [keys]);

  return active;
}

/**
 * The catalog, grouped by section, with the rail beside it (#1334).
 *
 * Every resource is expanded rather than hidden behind a selection: the
 * audience arrives either to read the page through or to answer one question,
 * and a rail that swapped one resource in and out would serve only the second.
 * The rail navigates and searches; the page stays a document.
 */
export function PermissionReferenceView({
  device,
  resources,
  holdersByResource,
  moduleLabels,
  disabledModules,
}: {
  device: DeviceClass;
  resources: PermissionResourceRow[];
  holdersByResource: Record<string, PermissionHolder[]>;
  moduleLabels: Record<string, string>;
  disabledModules: Record<string, boolean>;
}) {
  const resourceLabels = useMemo(
    () =>
      Object.fromEntries(
        resources.map((resource) => [resource.key, resource.label]),
      ),
    [resources],
  );

  const inertKeys = useMemo(
    () =>
      new Set(
        resources
          .filter(
            (resource) =>
              resource.module_key && disabledModules[resource.module_key],
          )
          .map((resource) => resource.key),
      ),
    [resources, disabledModules],
  );

  const keys = useMemo(
    () => resources.map((resource) => resource.key),
    [resources],
  );
  const active = useActiveResource(keys);

  const sections = useMemo(() => {
    const grouped = new Map<string, PermissionResourceRow[]>();
    for (const resource of resources) {
      grouped.set(resource.section, [
        ...(grouped.get(resource.section) ?? []),
        resource,
      ]);
    }
    return [...grouped.entries()];
  }, [resources]);

  function handleJump(key: string) {
    const card = document.getElementById(cardId(key));
    card?.scrollIntoView({ block: "start" });
    // The heading is what a screen reader should land on, and it carries
    // `tabIndex={-1}` so it can take focus without becoming a tab stop.
    document.getElementById(`${cardId(key)}-heading`)?.focus();
  }

  return (
    <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
      <PermissionReferenceRail
        device={device}
        resources={resources}
        inertKeys={inertKeys}
        active={active}
        onJump={handleJump}
      />

      <div className="min-w-0 space-y-6">
        <Card>
          <CardContent>
            <p className="text-sm">
              What every permission in this organization&apos;s matrix actually
              grants, level by level, and which adjacent permission covers what
              it does not. Grant them on{" "}
              <Link
                href="/portal/administration/roles?tab=permissions"
                className="font-medium underline underline-offset-2"
              >
                Roles → Permissions
              </Link>
              .
            </p>
          </CardContent>
        </Card>

        {sections.map(([section, sectionResources]) => (
          <section key={section} className="space-y-3">
            <h2 className="app-eyebrow text-sm">{section}</h2>
            {sectionResources.map((resource) => {
              const moduleOff = inertKeys.has(resource.key);
              // `scroll-mt-28` clears the portal's sticky header, the same way
              // Site Content's section cards do -- without it a jump puts the
              // heading behind the header and the card reads as starting
              // mid-sentence. The heading carries it too, since focusing it
              // scrolls as well.
              return (
                <Card
                  key={resource.key}
                  id={cardId(resource.key)}
                  className="scroll-mt-28"
                >
                  <CardContent className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3
                        id={`${cardId(resource.key)}-heading`}
                        tabIndex={-1}
                        className="scroll-mt-28 text-lg font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        {resource.label}
                      </h3>
                      {moduleOff && (
                        <Badge variant="secondary">Module off</Badge>
                      )}
                    </div>
                    <PermissionResourceDoc
                      resource={resource}
                      holders={holdersByResource[resource.key] ?? []}
                      moduleLabel={
                        resource.module_key
                          ? (moduleLabels[resource.module_key] ?? null)
                          : null
                      }
                      moduleEnabled={!moduleOff}
                      resourceLabels={resourceLabels}
                      // The resource's own name above is the h3, so the field
                      // headings are h4 here and h3 inside the sheet.
                      headingLevel={4}
                    />
                  </CardContent>
                </Card>
              );
            })}
          </section>
        ))}
      </div>
    </div>
  );
}
