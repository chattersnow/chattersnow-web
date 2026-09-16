"use client";

import { FormEvent, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PronounsField } from "@/components/pronouns-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import {
  EXPERIENCE_LEVELS,
  RIDING_DISCIPLINES,
  experienceLevelLabel,
  ridesSki,
  ridesSnowboard,
  ridingDisciplineLabel,
} from "@/lib/rider-profile";
import type { MyContactDetails } from "@/lib/constituent/contact";
import { saveMyContactDetailsAction } from "./actions";

/**
 * The allowlist, as a form (#1164).
 *
 * Fully controlled rather than read off the DOM at submit: three of these
 * fields are Selects, and two of them appear and disappear with the answer to
 * a third, so a `new FormData(form)` would carry whichever ones happened to be
 * mounted. Building the payload from state keeps what is sent equal to what
 * the person sees.
 *
 * Every field is optional and nothing here is required, which is deliberate.
 * A person arriving to fix a phone number must not be held up by a postal
 * address the organization has never needed.
 *
 * Email is not on this form. It moves through EmailChangeForm, because it
 * moves only once a link sent to the new address comes back.
 */
export function ContactForm({ details }: { details: MyContactDetails }) {
  const [form, setForm] = useState({
    preferredName: details.preferred_name ?? "",
    phone: details.phone ?? "",
    pronouns: details.pronouns ?? "",
    instagramHandle: details.instagram_handle ?? "",
    preferredMountain: details.preferred_mountain ?? "",
    ridingDiscipline: details.riding_discipline ?? "",
    skiExperienceLevel: details.ski_experience_level ?? "",
    snowboardExperienceLevel: details.snowboard_experience_level ?? "",
    addressLine1: details.address_line1 ?? "",
    addressLine2: details.address_line2 ?? "",
    addressCity: details.address_city ?? "",
    addressRegion: details.address_region ?? "",
    addressPostalCode: details.address_postal_code ?? "",
    addressCountry: details.address_country ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  function update(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
    setSaved(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSaving(true);

    const payload = new FormData();
    for (const [key, value] of Object.entries(form)) payload.set(key, value);

    const result = await saveMyContactDetailsAction(payload);
    setIsSaving(false);

    if ("error" in result) {
      setError(result.error);
      return;
    }
    setSaved(true);
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <FieldGroup>
        <FieldSet>
          <FieldLegend>How to reach you</FieldLegend>
          <FieldGroup>
            <Field orientation="responsive">
              <Field>
                <FieldLabel htmlFor="my-preferredName">
                  The name you go by
                </FieldLabel>
                <Input
                  id="my-preferredName"
                  value={form.preferredName}
                  onChange={(event) =>
                    update("preferredName", event.target.value)
                  }
                />
                <FieldDescription>
                  What we call you. We keep{" "}
                  {details.name ? `“${details.name}”` : "your full name"} on the
                  record itself — tell us if that needs correcting.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="my-phone">Phone</FieldLabel>
                <Input
                  id="my-phone"
                  type="tel"
                  autoComplete="tel"
                  value={form.phone}
                  onChange={(event) => update("phone", event.target.value)}
                />
              </Field>
            </Field>

            <Field orientation="responsive">
              <PronounsField
                id="my-pronouns"
                value={form.pronouns}
                onChange={(value) => update("pronouns", value)}
              />
              <Field>
                <FieldLabel htmlFor="my-instagramHandle">Instagram</FieldLabel>
                <Input
                  id="my-instagramHandle"
                  // normalize_instagram_handle() strips a leading @, so the
                  // placeholder says so rather than asking for a form the
                  // code does not care about (#1182).
                  placeholder="handle, with or without the @"
                  value={form.instagramHandle}
                  onChange={(event) =>
                    update("instagramHandle", event.target.value)
                  }
                />
              </Field>
            </Field>
          </FieldGroup>
        </FieldSet>

        <FieldSeparator />

        <FieldSet>
          <FieldLegend>Where to send things</FieldLegend>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="my-addressLine1">Address</FieldLabel>
              <Input
                id="my-addressLine1"
                autoComplete="address-line1"
                value={form.addressLine1}
                onChange={(event) => update("addressLine1", event.target.value)}
              />
              <Input
                aria-label="Address line 2"
                autoComplete="address-line2"
                value={form.addressLine2}
                onChange={(event) => update("addressLine2", event.target.value)}
              />
            </Field>
            <Field orientation="responsive">
              <Field>
                <FieldLabel htmlFor="my-addressCity">City</FieldLabel>
                <Input
                  id="my-addressCity"
                  autoComplete="address-level2"
                  value={form.addressCity}
                  onChange={(event) =>
                    update("addressCity", event.target.value)
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="my-addressRegion">
                  State or region
                </FieldLabel>
                <Input
                  id="my-addressRegion"
                  autoComplete="address-level1"
                  value={form.addressRegion}
                  onChange={(event) =>
                    update("addressRegion", event.target.value)
                  }
                />
              </Field>
            </Field>
            <Field orientation="responsive">
              <Field>
                <FieldLabel htmlFor="my-addressPostalCode">
                  Postal code
                </FieldLabel>
                <Input
                  id="my-addressPostalCode"
                  autoComplete="postal-code"
                  value={form.addressPostalCode}
                  onChange={(event) =>
                    update("addressPostalCode", event.target.value)
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="my-addressCountry">Country</FieldLabel>
                <Input
                  id="my-addressCountry"
                  autoComplete="country-name"
                  value={form.addressCountry}
                  onChange={(event) =>
                    update("addressCountry", event.target.value)
                  }
                />
              </Field>
            </Field>
          </FieldGroup>
        </FieldSet>

        <FieldSeparator />

        <FieldSet>
          <FieldLegend>What you ride</FieldLegend>
          <FieldGroup>
            <Field orientation="responsive">
              <Field>
                <FieldLabel htmlFor="my-ridingDiscipline">Rides</FieldLabel>
                <Select
                  value={form.ridingDiscipline}
                  onValueChange={(value) =>
                    update("ridingDiscipline", String(value ?? ""))
                  }
                >
                  <SelectTrigger id="my-ridingDiscipline" className="w-full">
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
                <FieldLabel htmlFor="my-preferredMountain">
                  Preferred mountain
                </FieldLabel>
                <Input
                  id="my-preferredMountain"
                  value={form.preferredMountain}
                  onChange={(event) =>
                    update("preferredMountain", event.target.value)
                  }
                />
              </Field>
            </Field>

            {(ridesSki(form.ridingDiscipline) ||
              ridesSnowboard(form.ridingDiscipline)) && (
              <Field orientation="responsive">
                {ridesSki(form.ridingDiscipline) && (
                  <Field>
                    <FieldLabel htmlFor="my-skiExperienceLevel">
                      Ski experience
                    </FieldLabel>
                    <Select
                      value={form.skiExperienceLevel}
                      onValueChange={(value) =>
                        update("skiExperienceLevel", String(value ?? ""))
                      }
                    >
                      <SelectTrigger
                        id="my-skiExperienceLevel"
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
                    <FieldLabel htmlFor="my-snowboardExperienceLevel">
                      Snowboard experience
                    </FieldLabel>
                    <Select
                      value={form.snowboardExperienceLevel}
                      onValueChange={(value) =>
                        update("snowboardExperienceLevel", String(value ?? ""))
                      }
                    >
                      <SelectTrigger
                        id="my-snowboardExperienceLevel"
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
          </FieldGroup>
        </FieldSet>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={isSaving}>
            {isSaving ? (
              <>
                <Spinner /> Saving...
              </>
            ) : (
              "Save"
            )}
          </Button>
          {saved && (
            <p className="app-muted text-sm" role="status">
              Saved.
            </p>
          )}
        </div>
      </FieldGroup>
    </form>
  );
}
