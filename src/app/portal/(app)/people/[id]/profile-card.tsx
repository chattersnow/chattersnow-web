"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { updatePersonAction, type PersonListItem } from "../actions";
import {
  PersonFormFields,
  packPersonFormData,
  type PersonFormState,
} from "../person-form-fields";
import { PersonPicker, type PickedPerson } from "../person-picker";
import { rolesFor, type PersonRow } from "../people-shared";
import {
  experienceLevelLabel,
  ridesSki,
  ridesSnowboard,
  ridingDisciplineLabel,
} from "@/lib/rider-profile";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";

function formStateFor(person: PersonRow): PersonFormState {
  return {
    name: person.name ?? "",
    preferredName: person.preferred_name ?? "",
    email: person.email ?? "",
    phone: person.phone ?? "",
    instagramHandle: person.instagram_handle ?? "",
    notes: person.notes ?? "",
    logoUrl: person.logo_url ?? "",
    website: person.website ?? "",
    roles: {
      is_donor: person.is_donor,
      is_sponsor: person.is_sponsor,
      is_volunteer: person.is_volunteer,
      is_attendee: person.is_attendee,
    },
    isOrganization: person.is_organization,
    ridingDiscipline: person.riding_discipline ?? "",
    skiExperienceLevel: person.ski_experience_level ?? "",
    snowboardExperienceLevel: person.snowboard_experience_level ?? "",
    preferredMountain: person.preferred_mountain ?? "",
  };
}

export function ProfileCard({
  person,
  people,
  canManage,
}: {
  person: PersonRow;
  people: PersonListItem[];
  canManage: boolean;
}) {
  const router = useRouter();
  const formId = `person-profile-form-${person.id}`;
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [form, setForm] = useState<PersonFormState>(() => formStateFor(person));
  const [contact, setContact] = useState<PickedPerson | null>(
    person.primary_contact,
  );
  const [newPeople, setNewPeople] = useState<PersonListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const availablePeople = [...people, ...newPeople];

  function update<K extends keyof PersonFormState>(
    key: K,
    value: PersonFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function cancel() {
    setForm(formStateFor(person));
    setContact(person.primary_contact);
    setError(null);
    setMode("view");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await updatePersonAction(
        person.id,
        packPersonFormData(form),
        contact?.id ?? null,
      );
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setMode("view");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="app-muted text-sm font-semibold">
          Profile
        </CardTitle>
        {canManage && mode === "view" && (
          <CardAction>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Edit profile"
              onClick={() => setMode("edit")}
            >
              <Pencil />
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {mode === "view" ? (
          <div className="flex flex-col gap-3 text-sm">
            <div className="flex flex-wrap gap-2">
              {rolesFor(person).map((role) => (
                <Badge key={role} variant="secondary">
                  {role}
                </Badge>
              ))}
              {person.is_organization && (
                <Badge variant="outline">Organization</Badge>
              )}
            </div>
            <p>
              <span className="app-muted">Email:</span> {person.email ?? "—"}
            </p>
            <p>
              <span className="app-muted">Phone:</span> {person.phone ?? "—"}
            </p>
            <p>
              <span className="app-muted">Instagram:</span>{" "}
              {person.instagram_handle ? `@${person.instagram_handle}` : "—"}
            </p>
            <p>
              <span className="app-muted">Website:</span>{" "}
              {person.website ?? "—"}
            </p>
            {person.primary_contact && (
              <p>
                <span className="app-muted">Primary contact:</span>{" "}
                {person.primary_contact.name ?? "—"}
              </p>
            )}
            <p>
              <span className="app-muted">Rides:</span>{" "}
              {ridingDisciplineLabel(person.riding_discipline) ?? "—"}
            </p>
            {ridesSki(person.riding_discipline) && (
              <p>
                <span className="app-muted">Ski experience:</span>{" "}
                {experienceLevelLabel(person.ski_experience_level) ?? "—"}
              </p>
            )}
            {ridesSnowboard(person.riding_discipline) && (
              <p>
                <span className="app-muted">Snowboard experience:</span>{" "}
                {experienceLevelLabel(person.snowboard_experience_level) ?? "—"}
              </p>
            )}
            <p>
              <span className="app-muted">Preferred mountain:</span>{" "}
              {person.preferred_mountain ?? "—"}
            </p>
            <p>
              <span className="app-muted">Notes:</span> {person.notes ?? "—"}
            </p>
          </div>
        ) : (
          <form id={formId} onSubmit={handleSubmit}>
            <FieldGroup>
              <PersonFormFields
                form={form}
                update={update}
                idPrefix={`person-${person.id}`}
              />

              <Field>
                <FieldLabel>
                  Primary contact person (for an organization)
                </FieldLabel>
                <PersonPicker
                  people={availablePeople.filter((p) => p.id !== person.id)}
                  selected={contact}
                  onSelect={setContact}
                  onPersonCreated={(created) =>
                    setNewPeople((prev) => [
                      ...prev,
                      { ...created, is_sponsor: false },
                    ])
                  }
                />
              </Field>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </FieldGroup>
          </form>
        )}
      </CardContent>
      {mode === "edit" && (
        <CardFooter className="justify-end gap-2">
          <Button type="button" variant="ghost" onClick={cancel}>
            Cancel
          </Button>
          <Button type="submit" form={formId} disabled={isPending}>
            {isPending ? (
              <>
                <Spinner /> Saving...
              </>
            ) : (
              "Save changes"
            )}
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
