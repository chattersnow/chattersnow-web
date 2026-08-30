"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import {
  addOrganizationMembershipAction,
  removeOrganizationMembershipAction,
  type PersonListItem,
} from "../actions";
import { PersonPicker, type PickedPerson } from "../person-picker";
import type { OrganizationMembership } from "../people-shared";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Spinner } from "@/components/ui/spinner";

export function OrganizationsCard({
  personId,
  isOrganization,
  memberships,
  people,
  canManage,
}: {
  personId: string;
  isOrganization: boolean;
  memberships: OrganizationMembership[];
  people: PersonListItem[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [newPeople, setNewPeople] = useState<PersonListItem[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [selected, setSelected] = useState<PickedPerson | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaveTransition] = useTransition();
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [isRemoving, startRemoveTransition] = useTransition();

  const availablePeople = [...people, ...newPeople];
  const title = isOrganization
    ? "People in this organization"
    : "Organizations";

  function handleAdd() {
    if (!selected) {
      setError("Select or create a person to link.");
      return;
    }
    setError(null);
    startSaveTransition(async () => {
      const result = isOrganization
        ? await addOrganizationMembershipAction(personId, selected.id)
        : await addOrganizationMembershipAction(selected.id, personId);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setShowAdd(false);
      setSelected(null);
      router.refresh();
    });
  }

  function handleRemove(membershipId: string) {
    setRemovingId(membershipId);
    startRemoveTransition(async () => {
      await removeOrganizationMembershipAction(membershipId);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="app-muted text-sm font-semibold">
          {title} ({memberships.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {memberships.length === 0 ? (
          <p className="app-muted text-sm">
            {isOrganization
              ? "No people linked yet."
              : "Not linked to any organizations yet."}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  {isOrganization ? "Person" : "Organization"}
                </TableHead>
                <TableHead className="w-px" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {memberships.map((membership) => {
                const linked = isOrganization
                  ? membership.person
                  : membership.organization;
                return (
                  <TableRow key={membership.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/portal/people/${linked.id}`}
                        className="hover:underline"
                      >
                        {linked.name ?? "—"}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right">
                      {canManage && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Remove link"
                          disabled={isRemoving && removingId === membership.id}
                          onClick={() => handleRemove(membership.id)}
                        >
                          {isRemoving && removingId === membership.id ? (
                            <Spinner />
                          ) : (
                            <Trash2 />
                          )}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        {canManage &&
          (showAdd ? (
            <div className="rounded-md border border-[var(--line)] p-3">
              <PersonPicker
                people={availablePeople}
                selected={selected}
                onSelect={setSelected}
                onPersonCreated={(created) =>
                  setNewPeople((prev) => [
                    ...prev,
                    {
                      ...created,
                      is_sponsor: false,
                      is_organization: !isOrganization,
                    },
                  ])
                }
                onlyOrganizations={!isOrganization}
              />
              {error && (
                <Alert variant="destructive" className="mt-2">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <div className="mt-2 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setShowAdd(false);
                    setSelected(null);
                    setError(null);
                  }}
                >
                  Cancel
                </Button>
                <Button type="button" onClick={handleAdd} disabled={isSaving}>
                  {isSaving ? (
                    <>
                      <Spinner /> Saving...
                    </>
                  ) : (
                    "Add"
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              variant="secondary"
              className="self-start"
              onClick={() => setShowAdd(true)}
            >
              + Add {isOrganization ? "person" : "organization"}
            </Button>
          ))}
      </CardContent>
    </Card>
  );
}
