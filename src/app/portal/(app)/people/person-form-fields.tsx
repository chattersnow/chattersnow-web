"use client";

import {
  PERSON_TYPES,
  ROLE_OPTIONS,
  type PersonType,
  type RoleKey,
} from "./people-shared";
import {
  EXPERIENCE_LEVELS,
  RIDING_DISCIPLINES,
  experienceLevelLabel,
  ridesSki,
  ridesSnowboard,
  ridingDisciplineLabel,
} from "@/lib/rider-profile";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PronounsField } from "@/components/pronouns-field";

export type PersonFormState = {
  name: string;
  preferredName: string;
  email: string;
  phone: string;
  pronouns: string;
  instagramHandle: string;
  notes: string;
  logoUrl: string;
  website: string;
  roles: Record<RoleKey, boolean>;
  personType: PersonType;
  ridingDiscipline: string;
  skiExperienceLevel: string;
  snowboardExperienceLevel: string;
  preferredMountain: string;
};

export function emptyPersonForm(
  defaultRole?: RoleKey,
  defaultPersonType: PersonType = "individual",
): PersonFormState {
  return {
    name: "",
    preferredName: "",
    email: "",
    phone: "",
    pronouns: "",
    instagramHandle: "",
    notes: "",
    logoUrl: "",
    website: "",
    roles: {
      is_donor: defaultRole === "is_donor",
      is_sponsor: defaultRole === "is_sponsor",
      is_volunteer: defaultRole === "is_volunteer",
      is_attendee: defaultRole === "is_attendee",
      is_staff: defaultRole === "is_staff",
      is_partner: defaultRole === "is_partner",
    },
    personType: defaultPersonType,
    ridingDiscipline: "",
    skiExperienceLevel: "",
    snowboardExperienceLevel: "",
    preferredMountain: "",
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

  // Only the rendering branches on type. Values already on the record are
  // left alone rather than cleared, so switching an organization to an
  // individual by mistake does not throw away its logo and website.
  const isOrganization = form.personType === "organization";

  return (
    <>
      <Field orientation="responsive">
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-name`}>Name</FieldLabel>
          <Input
            id={`${idPrefix}-name`}
            required
            value={form.name}
            onChange={(event) => update("name", event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-preferredName`}>
            Preferred name
          </FieldLabel>
          <Input
            id={`${idPrefix}-preferredName`}
            value={form.preferredName}
            placeholder="Optional"
            onChange={(event) => update("preferredName", event.target.value)}
          />
        </Field>
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

      <PronounsField
        id={`${idPrefix}-pronouns`}
        value={form.pronouns}
        onChange={(value) => update("pronouns", value)}
        description="As the person gives them. Shown wherever we introduce or write about them."
      />

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
        <FieldLabel htmlFor={`${idPrefix}-personType`}>Type</FieldLabel>
        <Select
          value={form.personType}
          onValueChange={(value) =>
            update("personType", (value as PersonType) ?? "individual")
          }
        >
          <SelectTrigger id={`${idPrefix}-personType`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERSON_TYPES.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldDescription>
          Decides what the record holds: an organization has a logo, a website
          and members; an individual has a rider profile.
        </FieldDescription>
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
        <FieldDescription>
          These mark someone manually. Roles are also set automatically from
          donations, sponsorships, event registrations, volunteer records, and
          won partnerships, so a role earned that way stays on even when
          unchecked here.
        </FieldDescription>
      </Field>

      {isOrganization && (
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
      )}

      {!isOrganization && (
        <Field orientation="responsive">
          <Field>
            <FieldLabel htmlFor={`${idPrefix}-ridingDiscipline`}>
              Rides
            </FieldLabel>
            <Select
              value={form.ridingDiscipline}
              onValueChange={(value) =>
                update("ridingDiscipline", String(value ?? ""))
              }
            >
              <SelectTrigger
                id={`${idPrefix}-ridingDiscipline`}
                className="w-full"
              >
                <SelectValue placeholder="Not recorded">
                  {(value: string) => ridingDisciplineLabel(value)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {RIDING_DISCIPLINES.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor={`${idPrefix}-preferredMountain`}>
              Preferred mountain
            </FieldLabel>
            <Input
              id={`${idPrefix}-preferredMountain`}
              value={form.preferredMountain}
              onChange={(event) =>
                update("preferredMountain", event.target.value)
              }
            />
          </Field>
        </Field>
      )}

      {!isOrganization &&
        (ridesSki(form.ridingDiscipline) ||
          ridesSnowboard(form.ridingDiscipline)) && (
          <Field orientation="responsive">
            {ridesSki(form.ridingDiscipline) && (
              <Field>
                <FieldLabel htmlFor={`${idPrefix}-skiExperienceLevel`}>
                  Ski experience
                </FieldLabel>
                <Select
                  value={form.skiExperienceLevel}
                  onValueChange={(value) =>
                    update("skiExperienceLevel", String(value ?? ""))
                  }
                >
                  <SelectTrigger
                    id={`${idPrefix}-skiExperienceLevel`}
                    className="w-full"
                  >
                    <SelectValue placeholder="Not recorded">
                      {(value: string) => experienceLevelLabel(value)}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {EXPERIENCE_LEVELS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
            {ridesSnowboard(form.ridingDiscipline) && (
              <Field>
                <FieldLabel htmlFor={`${idPrefix}-snowboardExperienceLevel`}>
                  Snowboard experience
                </FieldLabel>
                <Select
                  value={form.snowboardExperienceLevel}
                  onValueChange={(value) =>
                    update("snowboardExperienceLevel", String(value ?? ""))
                  }
                >
                  <SelectTrigger
                    id={`${idPrefix}-snowboardExperienceLevel`}
                    className="w-full"
                  >
                    <SelectValue placeholder="Not recorded">
                      {(value: string) => experienceLevelLabel(value)}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {EXPERIENCE_LEVELS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
          </Field>
        )}

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
  formData.set("preferredName", form.preferredName);
  formData.set("email", form.email);
  formData.set("phone", form.phone);
  formData.set("pronouns", form.pronouns);
  formData.set("instagramHandle", form.instagramHandle);
  formData.set("notes", form.notes);
  formData.set("logoUrl", form.logoUrl);
  formData.set("website", form.website);
  formData.set("isDonor", String(form.roles.is_donor));
  formData.set("isSponsor", String(form.roles.is_sponsor));
  formData.set("isVolunteer", String(form.roles.is_volunteer));
  formData.set("isAttendee", String(form.roles.is_attendee));
  formData.set("isStaff", String(form.roles.is_staff));
  formData.set("isPartner", String(form.roles.is_partner));
  formData.set("personType", form.personType);
  formData.set("ridingDiscipline", form.ridingDiscipline);
  formData.set("skiExperienceLevel", form.skiExperienceLevel);
  formData.set("snowboardExperienceLevel", form.snowboardExperienceLevel);
  formData.set("preferredMountain", form.preferredMountain);
  return formData;
}
