"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  PermissionResourceDoc,
  type PermissionHolder,
  type PermissionResourceRow,
} from "@/components/portal/permission-resource-doc";

/**
 * The catalog, grouped by section and filterable.
 *
 * Every resource is expanded rather than sitting behind a rail: the audience
 * arrives either to read it through or to answer one question with the
 * browser's own find, and a rail serves neither. The filter is here because 35
 * resources across ten sections is more than a page of scrolling when the
 * question is "which one covers expenses?".
 */
export function PermissionReferenceView({
  resources,
  holdersByResource,
  moduleLabels,
  disabledModules,
}: {
  resources: PermissionResourceRow[];
  holdersByResource: Record<string, PermissionHolder[]>;
  moduleLabels: Record<string, string>;
  disabledModules: Record<string, boolean>;
}) {
  const [query, setQuery] = useState("");

  const resourceLabels = useMemo(
    () =>
      Object.fromEntries(
        resources.map((resource) => [resource.key, resource.label]),
      ),
    [resources],
  );

  const sections = useMemo(() => {
    const term = query.trim().toLowerCase();
    const matches = (resource: PermissionResourceRow) =>
      !term ||
      [resource.key, resource.label, resource.section, resource.description]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(term));

    const grouped = new Map<string, PermissionResourceRow[]>();
    for (const resource of resources.filter(matches)) {
      grouped.set(resource.section, [
        ...(grouped.get(resource.section) ?? []),
        resource,
      ]);
    }
    return [...grouped.entries()];
  }, [resources, query]);

  const found = sections.reduce(
    (total, [, sectionResources]) => total + sectionResources.length,
    0,
  );

  return (
    <div className="mt-6 space-y-6">
      <Card>
        <CardContent className="space-y-3">
          <p className="text-sm">
            What every permission in this organization&apos;s matrix actually
            grants, level by level, and which adjacent permission covers what it
            does not. Grant them on{" "}
            <Link
              href="/portal/administration/roles?tab=permissions"
              className="font-medium underline underline-offset-2"
            >
              Roles → Permissions
            </Link>
            .
          </p>
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter by name, key, or section"
            aria-label="Filter permissions"
            className="max-w-md"
          />
          {query.trim() !== "" && (
            <p className="app-muted text-sm" aria-live="polite">
              {found} permission{found === 1 ? "" : "s"} match
              {found === 1 ? "es" : ""} “{query.trim()}”.
            </p>
          )}
        </CardContent>
      </Card>

      {sections.map(([section, sectionResources]) => (
        <section key={section} className="space-y-3">
          <h2 className="app-eyebrow text-sm">{section}</h2>
          {sectionResources.map((resource) => {
            const moduleOff = Boolean(
              resource.module_key && disabledModules[resource.module_key],
            );
            return (
              <Card key={resource.key} id={`resource-${resource.key}`}>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold">{resource.label}</h3>
                    {moduleOff && <Badge variant="secondary">Module off</Badge>}
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

      {found === 0 && (
        <Card>
          <CardContent className="app-muted text-sm">
            No permission matches that filter.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
