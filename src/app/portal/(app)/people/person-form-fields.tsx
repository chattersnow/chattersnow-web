"use client";

import { ROLE_OPTIONS, type RoleKey } from "./people-shared";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export type PersonFormState = {
  name: string;
  email: string;
  phone: string;
  instagramHandle: string;
  notes: string;
  logoUrl: string;
  website: string;
  roles: Record<RoleKey, boolean>;
  isOrganization: boolean;
};

export function emptyPersonForm(
  defaultRole?: RoleKey,
  defaultIsOrganization = false,
): PersonFormState {
  return {
    name: "",
    email: "",
    phone: "",
    instagramHandle: "",
    notes: "",
    logoUrl: "",
    website: "",
    roles: {
      is_donor: defaultRole === "is_donor",
      is_sponsor: defaultRole === "is_sponsor",
      is_volunteer: defaultRole === "is_volunteer",
    },
    isOrganization: defaultIsOrganization,
  };
}

export function PersonFormFields({
  form,
  update,
  idPrefix,
}: {
  form: PersonFormState;
  update: <K extends keyof PersonFormState>(
    key: K,
    value: PersonFormState[K],
  ) => void;
  idPrefix: string;
}) {
  function toggleRole(key: RoleKey, checked: boolean) {
    update("roles", { ...form.roles, [key]: checked });
  }

  return (
    <>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-name`}>Name</FieldLabel>
        <Input
          id={`${idPrefix}-name`}
          required
          value={form.name}
          onChange={(event) => update("name", event.target.value)}
        />
      </Field>

      <Field orientation="responsive">
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-email`}>Email</FieldLabel>
          <Input
            id={`${idPrefix}-email`}
            type="email"
            value={form.email}
            onChange={(event) => update("email", event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-phone`}>Phone</FieldLabel>
          <Input
            id={`${idPrefix}-phone`}
            type="tel"
            value={form.phone}
            onChange={(event) => update("phone", event.target.value)}
          />
        </Field>
      </Field>

      <Field>
        <FieldLabel htmlFor={`${idPrefix}-instagramHandle`}>
          Instagram handle
        </FieldLabel>
        <Input
          id={`${idPrefix}-instagramHandle`}
          placeholder="e.g. chattersnow"
          value={form.instagramHandle}
          onChange={(event) => update("instagramHandle", event.target.value)}
        />
      </Field>

      <Field>
        <FieldLabel>Roles</FieldLabel>
        <div className="flex flex-wrap gap-4">
          {ROLE_OPTIONS.map((option) => (
            <label key={option.key} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.roles[option.key]}
                onCheckedChange={(checked) => toggleRole(option.key, checked)}
              />
              {option.label}
            </label>
          ))}
        </div>
      </Field>

      <Field orientation="horizontal">
        <Checkbox
          id={`${idPrefix}-isOrganization`}
          checked={form.isOrganization}
          onCheckedChange={(checked) =>
            update("isOrganization", Boolean(checked))
          }
        />
        <FieldLabel htmlFor={`${idPrefix}-isOrganization`}>
          This is an organization
        </FieldLabel>
      </Field>

      <Field orientation="responsive">
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-logoUrl`}>Logo URL</FieldLabel>
          <Input
            id={`${idPrefix}-logoUrl`}
            type="url"
            placeholder="https://..."
            value={form.logoUrl}
            onChange={(event) => update("logoUrl", event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-website`}>Website</FieldLabel>
          <Input
            id={`${idPrefix}-website`}
            type="url"
            placeholder="https://..."
            value={form.website}
            onChange={(event) => update("website", event.target.value)}
          />
        </Field>
      </Field>

      <Field>
        <FieldLabel htmlFor={`${idPrefix}-notes`}>Notes</FieldLabel>
        <Textarea
          id={`${idPrefix}-notes`}
          value={form.notes}
          onChange={(event) => update("notes", event.target.value)}
        />
      </Field>
    </>
  );
}

export function packPersonFormData(form: PersonFormState) {
  const formData = new FormData();
  formData.set("name", form.name);
  formData.set("email", form.email);
  formData.set("phone", form.phone);
  formData.set("instagramHandle", form.instagramHandle);
  formData.set("notes", form.notes);
  formData.set("logoUrl", form.logoUrl);
  formData.set("website", form.website);
  formData.set("isDonor", String(form.roles.is_donor));
  formData.set("isSponsor", String(form.roles.is_sponsor));
  formData.set("isVolunteer", String(form.roles.is_volunteer));
  formData.set("isOrganization", String(form.isOrganization));
  return formData;
}
