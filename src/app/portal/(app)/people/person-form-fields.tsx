"use client";

import { PERSON_TYPES, type PersonType, type RoleKey } from "./people-shared";
import { PERSON_ROLES, personRoleLabel } from "@/lib/person-roles";
import { useLexicon } from "@/components/lexicon-context";
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
import {
  ImagePreviewBox,
  OpenPictureLink,
  useImagePreview,
} from "../website/image-preview";

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
  /**
   * Publish this organization to the public sponsor wall (#1024). Only
   * meaningful alongside the sponsor role on an organization, which is the
   * only combination that renders the control -- and the only one
   * parsePersonForm will act on.
   */
  sponsorWallPublic: boolean;
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
      is_recipient: defaultRole === "is_recipient",
    },
    sponsorWallPublic: false,
    personType: defaultPersonType,
    ridingDiscipline: "",
    skiExperienceLevel: "",
    snowboardExperienceLevel: "",
    preferredMountain: "",
  };
}

/**
 * Whether `form` differs from `baseline` in anything a person would call
 * typing. Field by field rather than `!==` over the object: `roles` is a
 * nested object, so two fresh `emptyPersonForm()` results compared by
 * reference were always "different", and the New Person dialog armed its
 * "Leave site?" prompt on every people page before anyone opened it -- which
 * is what blocked the directory's search form from submitting.
 */
export function personFormDirty(
  form: PersonFormState,
  baseline: PersonFormState,
): boolean {
  return (Object.keys(baseline) as (keyof PersonFormState)[]).some((key) => {
    if (key === "roles") {
      return (Object.keys(baseline.roles) as RoleKey[]).some(
        (role) => form.roles[role] !== baseline.roles[role],
      );
    }
    return form[key] !== baseline[key];
  });
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
  // What this organization calls the seven roles (#911). From the shell's
  // context rather than a prop: this form renders inside the New Person dialog
  // on eight segment pages and inside the profile card's edit mode, and a prop
  // threaded through all of them is one that gets dropped.
  const vocabulary = useLexicon();

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
          <FieldLabel htmlFor={`${idPrefix}-name`} required>
            Name
          </FieldLabel>
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
          placeholder="e.g. yourorganization"
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
          {PERSON_ROLES.map((role) => (
            <label key={role.key} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.roles[role.key]}
                onCheckedChange={(checked) => toggleRole(role.key, checked)}
              />
              {personRoleLabel(role.key, vocabulary)}
            </label>
          ))}
        </div>
        <FieldDescription>
          These mark someone manually. Roles are also set automatically from
          donations, sponsorships, event registrations, volunteer records, won
          partnerships, and gear requested or handed over, so a role earned that
          way stays on even when unchecked here.
        </FieldDescription>
      </Field>

      {/*
        The one role with a public surface (#1024). Organizations only, for
        the same reason the logo and website below are: the wall shows a mark,
        and an individual with no logo would be published as their own name.
        Marking someone a sponsor is a directory fact; putting them on the
        public site is a separate decision, so it gets its own tick rather
        than riding on the role.
      */}
      {isOrganization && form.roles.is_sponsor && (
        <Field>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={form.sponsorWallPublic}
              onCheckedChange={(checked) =>
                update("sponsorWallPublic", checked)
              }
            />
            Show on the public sponsor wall
          </label>
          <FieldDescription>
            Puts this organization on the sponsorship page, using the name, logo
            and website on this record. Sponsors credited on a published public
            event are already there and need no tick here.
          </FieldDescription>
        </Field>
      )}

      {isOrganization && (
        <Field orientation="responsive">
          <LogoUrlField
            id={`${idPrefix}-logoUrl`}
            value={form.logoUrl}
            onChange={(value) => update("logoUrl", value)}
          />
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

/**
 * The sponsor logo box, with the picture it points at (#1028).
 *
 * It was a bare `<Input>` while every other picture field in the portal --
 * branding, Site Content slots, inventory photos, event fliers -- showed a
 * preview, and a logo that cannot load is invisible without one: the public
 * wall silently falls back to the sponsor's name (#914), so nothing anywhere
 * said the link was dead. Chatter Snow shipped one that way.
 *
 * Contained rather than cropped, and in a box roughly the shape of the widest
 * mark the wall draws, because neither wall layout crops a logo -- previewing
 * it `object-cover` would show ends cut off that the site never cuts.
 */
function LogoUrlField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const preview = useImagePreview(value || null);

  return (
    <Field>
      <FieldLabel htmlFor={id}>Logo URL</FieldLabel>
      {preview.url && (
        <ImagePreviewBox
          url={preview.url}
          ratio="4 / 1"
          fit="contain"
          className="h-16"
          onError={preview.markFailed}
        />
      )}
      <Input
        id={id}
        type="url"
        placeholder="https://drive.google.com/file/d/..."
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {preview.failed ? (
        <FieldDescription className="text-destructive">
          That link did not load as a picture. A Google Drive link has to be a
          file rather than a folder, and shared with anyone who has the link.
        </FieldDescription>
      ) : (
        <FieldDescription>
          A Google Drive share link or a direct image URL. Shown on the public
          sponsor wall.
        </FieldDescription>
      )}
      {preview.url && <OpenPictureLink url={preview.url} label="Logo" />}
    </Field>
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
  formData.set("isRecipient", String(form.roles.is_recipient));
  // Sent on every save, like the roles themselves: the server rewrites the
  // whole tag set each time, so an omitted flag would read as "unpublish".
  formData.set("sponsorWallPublic", String(form.sponsorWallPublic));
  formData.set("personType", form.personType);
  formData.set("ridingDiscipline", form.ridingDiscipline);
  formData.set("skiExperienceLevel", form.skiExperienceLevel);
  formData.set("snowboardExperienceLevel", form.snowboardExperienceLevel);
  formData.set("preferredMountain", form.preferredMountain);
  return formData;
}
