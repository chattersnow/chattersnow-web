"use client";

import { useState, useTransition } from "react";
import { createPersonAction } from "./actions";
import {
  PersonFormFields,
  emptyPersonForm,
  packPersonFormData,
  type PersonFormState,
} from "./person-form-fields";
import type { PersonListItem } from "./actions";
import {
  PortalUserBadge,
  isOrganization,
  type PersonType,
  type RoleKey,
} from "./people-shared";
import { filterPeople } from "./person-search";
import { personDisplayName } from "@/lib/format";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { runAction } from "@/components/portal/action-toast";

export type PickedPerson = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  /** Optional for the same reason as on PersonListItem -- many callers build
   * a PickedPerson from a narrower embedded `people(...)` relation. */
  preferred_name?: string | null;
  auth_user_id?: string | null;
};

export function PersonPicker({
  people,
  selected,
  onSelect,
  onPersonCreated,
  newPersonRole,
  placeholder = "Search by name or email...",
  allowCreate = true,
  onlyOrganizations = false,
}: {
  people: PersonListItem[];
  selected: PickedPerson | null;
  onSelect: (person: PickedPerson | null) => void;
  onPersonCreated: (person: PickedPerson) => void;
  /**
   * Role to pre-check in "+ Create new person". Intentionally has no default:
   * this used to fall back to is_sponsor, which pre-checked Sponsor on every
   * picker in the app (issue #569). Pass one only where the surrounding
   * context implies a role; leave it unset elsewhere so nothing is guessed.
   */
  newPersonRole?: RoleKey;
  placeholder?: string;
  allowCreate?: boolean;
  /** Restrict search/create to organization people rows. */
  onlyOrganizations?: boolean;
}) {
  const pickerPersonType: PersonType = onlyOrganizations
    ? "organization"
    : "individual";
  const [query, setQuery] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<PersonFormState>(() =>
    emptyPersonForm(newPersonRole, pickerPersonType),
  );
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, startCreateTransition] = useTransition();

  const candidatePeople = onlyOrganizations
    ? people.filter(isOrganization)
    : people;

  function updateCreateForm<K extends keyof PersonFormState>(
    key: K,
    value: PersonFormState[K],
  ) {
    setCreateForm((prev) => ({ ...prev, [key]: value }));
  }

  function reset() {
    setQuery("");
    setShowCreate(false);
    setCreateForm(emptyPersonForm(newPersonRole, pickerPersonType));
    setCreateError(null);
  }

  if (selected) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border border-[var(--line)] px-3 py-2">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">{personDisplayName(selected)}</p>
            <PortalUserBadge person={selected} />
          </div>
          {selected.email && (
            <p className="app-muted text-xs">{selected.email}</p>
          )}
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            onSelect(null);
            reset();
          }}
        >
          Change
        </Button>
      </div>
    );
  }

  const normalizedQuery = query.trim();
  const matches = filterPeople(candidatePeople, query);

  function handleCreateSubmit() {
    setCreateError(null);

    startCreateTransition(async () => {
      await runAction(
        () => createPersonAction(packPersonFormData(createForm)),
        {
          success: (result) =>
            `${personDisplayName(result.person)} added to people.`,
          onError: setCreateError,
          onSuccess: (result) => {
            if (!result.person) return;
            onPersonCreated(result.person);
            onSelect(result.person);
            reset();
          },
        },
      );
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Input
        placeholder={placeholder}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      {normalizedQuery && matches.length > 0 && (
        <div className="flex flex-col divide-y divide-[var(--line)] rounded-md border border-[var(--line)]">
          {matches.slice(0, 8).map((person) => (
            <button
              key={person.id}
              type="button"
              className="flex flex-col items-start px-3 py-2 text-left text-sm hover:bg-[var(--purple-soft)]"
              onClick={() => onSelect(person)}
            >
              <span className="flex items-center gap-2">
                <span className="font-medium">{personDisplayName(person)}</span>
                <PortalUserBadge person={person} />
              </span>
              {person.email && (
                <span className="app-muted text-xs">{person.email}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {normalizedQuery && matches.length === 0 && !showCreate && (
        <p className="app-muted text-sm">No matches for &quot;{query}&quot;.</p>
      )}

      {!allowCreate ? null : !showCreate ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="self-start"
          onClick={() => setShowCreate(true)}
        >
          + Create new {onlyOrganizations ? "organization" : "person"}
        </Button>
      ) : (
        <div className="rounded-md border border-[var(--line)] p-3">
          <FieldGroup>
            <PersonFormFields
              form={createForm}
              update={updateCreateForm}
              idPrefix="picker-new-person"
            />

            {createError && (
              <Alert variant="destructive">
                <AlertDescription>{createError}</AlertDescription>
              </Alert>
            )}

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowCreate(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleCreateSubmit}
                disabled={isCreating}
              >
                {isCreating ? (
                  <>
                    <Spinner /> Creating...
                  </>
                ) : (
                  "Create & select"
                )}
              </Button>
            </div>
          </FieldGroup>
        </div>
      )}
    </div>
  );
}
