"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EditDisclosureModal } from "./edit-disclosure-modal";
import { NewDisclosureDialog } from "./new-disclosure-dialog";
import type { Disclosure } from "./disclosures-actions";
import type { PersonListItem } from "../../people/actions";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeZone: "UTC",
});

function formatDate(value: string | null) {
  if (!value) return "—";
  return dateFormatter.format(new Date(value));
}

export function DisclosuresTable({
  disclosures,
  people,
  canManage,
}: {
  disclosures: Disclosure[];
  people: PersonListItem[];
  canManage: boolean;
}) {
  const [search, setSearch] = useState("");

  const visibleDisclosures = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return disclosures;
    return disclosures.filter(
      (disclosure) =>
        (disclosure.person.name ?? "").toLowerCase().includes(query) ||
        String(disclosure.disclosure_year).includes(query),
    );
  }, [disclosures, search]);

  if (disclosures.length === 0) {
    return (
      <div className="space-y-4">
        {canManage && <NewDisclosureDialog people={people} />}
        <Card>
          <CardContent className="px-0">
            <p className="app-muted px-4 py-6 text-sm">
              No disclosures recorded yet.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        {canManage && <NewDisclosureDialog people={people} />}

        <div className="flex flex-col gap-1">
          <label
            htmlFor="disclosures-search"
            className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
          >
            Search
          </label>
          <Input
            id="disclosures-search"
            placeholder="Search person or year..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-8 w-full sm:w-64"
          />
        </div>
      </div>

      <Card>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Person</TableHead>
                <TableHead>Disclosure year</TableHead>
                <TableHead>On-file date</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="w-0">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleDisclosures.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="app-muted text-center">
                    No disclosures match your search.
                  </TableCell>
                </TableRow>
              ) : (
                visibleDisclosures.map((disclosure) => (
                  <TableRow key={disclosure.id}>
                    <TableCell className="font-medium">
                      {disclosure.person.name ?? "—"}
                    </TableCell>
                    <TableCell className="app-muted">
                      {disclosure.disclosure_year}
                    </TableCell>
                    <TableCell className="app-muted">
                      {formatDate(disclosure.on_file_date)}
                    </TableCell>
                    <TableCell
                      className="app-muted max-w-xs truncate"
                      title={disclosure.notes ?? undefined}
                    >
                      {disclosure.notes || "—"}
                    </TableCell>
                    <TableCell>
                      {canManage && (
                        <EditDisclosureModal
                          disclosure={disclosure}
                          people={people}
                        />
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
