"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EditPersonModal } from "./edit-person-modal";
import { NewPersonDialog } from "./new-person-dialog";
import { ROLE_OPTIONS, rolesFor, type PersonRow, type RoleKey } from "./people-shared";

const FILTER_ALL = "all";

export function PeopleTable({ people, canManage }: { people: PersonRow[]; canManage: boolean }) {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleKey | typeof FILTER_ALL>(FILTER_ALL);

  const visiblePeople = useMemo(() => {
    const query = search.trim().toLowerCase();

    return people
      .filter((person) => {
        if (roleFilter !== FILTER_ALL && !person[roleFilter]) return false;
        if (!query) return true;
        return (
          (person.name ?? "").toLowerCase().includes(query) ||
          (person.email ?? "").toLowerCase().includes(query) ||
          (person.phone ?? "").toLowerCase().includes(query)
        );
      })
      .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  }, [people, search, roleFilter]);

  if (people.length === 0) {
    return (
      <div className="space-y-4">
        {canManage && <NewPersonDialog />}
        <Card>
          <CardContent className="px-0">
            <p className="app-muted px-4 py-6 text-sm">No people added yet.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        {canManage && <NewPersonDialog />}

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="people-search"
              className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
            >
              Search
            </label>
            <Input
              id="people-search"
              placeholder="Search name, email, phone..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-8 w-full sm:w-64"
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="app-muted text-xs font-semibold uppercase tracking-[0.1em]">Role</span>
            <Select
              value={roleFilter}
              onValueChange={(value) => setRoleFilter((value as RoleKey | typeof FILTER_ALL) ?? FILTER_ALL)}
            >
              <SelectTrigger className="h-8">
                <SelectValue placeholder="Role">
                  {(value: string) => {
                    if (value === FILTER_ALL) return "All people";
                    return ROLE_OPTIONS.find((option) => option.key === value)?.label ?? "Role";
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FILTER_ALL}>All people</SelectItem>
                {ROLE_OPTIONS.map((option) => (
                  <SelectItem key={option.key} value={option.key}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead className="w-0">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visiblePeople.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="app-muted text-center">
                    No people match your filters.
                  </TableCell>
                </TableRow>
              ) : (
                visiblePeople.map((person) => (
                  <TableRow key={person.id}>
                    <TableCell className="font-medium">{person.name ?? "—"}</TableCell>
                    <TableCell className="app-muted">{rolesFor(person).join(", ") || "—"}</TableCell>
                    <TableCell className="app-muted">{person.email ?? "—"}</TableCell>
                    <TableCell className="app-muted">{person.phone ?? "—"}</TableCell>
                    <TableCell>{canManage && <EditPersonModal person={person} />}</TableCell>
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
