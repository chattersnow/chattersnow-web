"use client";

import { useState } from "react";
import {
  ASSET_STATUS_OPTIONS,
  CATEGORY_OPTIONS,
  CREDENTIAL_MANAGEMENT_LOCATION_OPTIONS,
  MFA_STATUS_OPTIONS,
  SENSITIVITY_OPTIONS,
} from "./labels";
import { PersonSelect } from "../../people/person-select";
import { ServiceSelect } from "./service-select";
import type { AssetFormData } from "./asset-form";
import type { PersonListItem } from "../../people/actions";
import type { ServiceRow } from "@/lib/portal/access-management/types";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

export type AssetFormState = Omit<
  AssetFormData,
  "description" | "url" | "notes"
> & {
  description: string;
  url: string;
  notes: string;
};

export function emptyAssetForm(): AssetFormState {
  return {
    name: "",
    service_id: "",
    category: "hosting",
    description: "",
    url: "",
    is_org_owned: true,
    owner_person_id: null,
    primary_admin_person_id: null,
    backup_admin_person_id: null,
    status: "active",
    sensitivity: "medium",
    mfa_required: false,
    mfa_status: "unknown",
    recovery_documented: false,
    recovery_owner_person_id: null,
    credential_management_location: "unknown",
    notes: "",
  };
}

export function packAssetFormData(form: AssetFormState): FormData {
  const formData = new FormData();
  formData.set("name", form.name);
  formData.set("service_id", form.service_id);
  formData.set("category", form.category);
  formData.set("description", form.description);
  formData.set("url", form.url);
  formData.set("is_org_owned", String(form.is_org_owned));
  formData.set("owner_person_id", form.owner_person_id ?? "");
  formData.set("primary_admin_person_id", form.primary_admin_person_id ?? "");
  formData.set("backup_admin_person_id", form.backup_admin_person_id ?? "");
  formData.set("status", form.status);
  formData.set("sensitivity", form.sensitivity);
  formData.set("mfa_required", String(form.mfa_required));
  formData.set("mfa_status", form.mfa_status);
  formData.set("recovery_documented", String(form.recovery_documented));
  formData.set("recovery_owner_person_id", form.recovery_owner_person_id ?? "");
  formData.set(
    "credential_management_location",
    form.credential_management_location,
  );
  formData.set("notes", form.notes);
  return formData;
}

function EnumSelect({
  id,
  value,
  onChange,
  options,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next ?? value)}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue>
          {(current: string) =>
            options.find((option) => option.value === current)?.label ?? current
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function AssetFormFields({
  idPrefix,
  form,
  update,
  services: initialServices,
  people,
}: {
  idPrefix: string;
  form: AssetFormState;
  update: <K extends keyof AssetFormState>(
    key: K,
    value: AssetFormState[K],
  ) => void;
  services: ServiceRow[];
  people: PersonListItem[];
}) {
  const [services, setServices] = useState(initialServices);

  return (
    <Tabs defaultValue="overview">
      <TabsList variant="line" className="flex-wrap">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="ownership">Ownership</TabsTrigger>
        <TabsTrigger value="security">Security &amp; recovery</TabsTrigger>
        <TabsTrigger value="notes">Notes</TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="mt-4">
        <FieldGroup>
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
            <FieldLabel htmlFor={`${idPrefix}-service`}>Service</FieldLabel>
            <ServiceSelect
              id={`${idPrefix}-service`}
              services={services}
              value={form.service_id}
              onChange={(serviceId) => update("service_id", serviceId)}
              onServiceCreated={(service) =>
                setServices((prev) => [...prev, service as ServiceRow])
              }
            />
          </Field>

          <Field>
            <FieldLabel htmlFor={`${idPrefix}-category`}>Category</FieldLabel>
            <EnumSelect
              id={`${idPrefix}-category`}
              value={form.category}
              onChange={(value) =>
                update("category", value as AssetFormState["category"])
              }
              options={CATEGORY_OPTIONS}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor={`${idPrefix}-url`}>URL</FieldLabel>
            <Input
              id={`${idPrefix}-url`}
              type="url"
              placeholder="https://"
              value={form.url}
              onChange={(event) => update("url", event.target.value)}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor={`${idPrefix}-description`}>
              Description
            </FieldLabel>
            <Textarea
              id={`${idPrefix}-description`}
              value={form.description}
              onChange={(event) => update("description", event.target.value)}
              rows={2}
            />
          </Field>
        </FieldGroup>
      </TabsContent>

      <TabsContent value="ownership" className="mt-4">
        <FieldGroup>
          <Field>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.is_org_owned}
                onCheckedChange={(checked) =>
                  update("is_org_owned", checked === true)
                }
              />
              Organization-owned
            </label>
          </Field>

          <Field>
            <FieldLabel htmlFor={`${idPrefix}-owner`}>Owner</FieldLabel>
            <PersonSelect
              id={`${idPrefix}-owner`}
              people={people}
              value={form.owner_person_id}
              onChange={(personId) => update("owner_person_id", personId)}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor={`${idPrefix}-primary-admin`}>
              Primary administrator
            </FieldLabel>
            <PersonSelect
              id={`${idPrefix}-primary-admin`}
              people={people}
              value={form.primary_admin_person_id}
              onChange={(personId) =>
                update("primary_admin_person_id", personId)
              }
            />
          </Field>

          <Field>
            <FieldLabel htmlFor={`${idPrefix}-backup-admin`}>
              Backup administrator
            </FieldLabel>
            <PersonSelect
              id={`${idPrefix}-backup-admin`}
              people={people}
              value={form.backup_admin_person_id}
              onChange={(personId) =>
                update("backup_admin_person_id", personId)
              }
            />
          </Field>
        </FieldGroup>
      </TabsContent>

      <TabsContent value="security" className="mt-4">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor={`${idPrefix}-status`}>Status</FieldLabel>
            <EnumSelect
              id={`${idPrefix}-status`}
              value={form.status}
              onChange={(value) =>
                update("status", value as AssetFormState["status"])
              }
              options={ASSET_STATUS_OPTIONS}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor={`${idPrefix}-sensitivity`}>
              Sensitivity
            </FieldLabel>
            <EnumSelect
              id={`${idPrefix}-sensitivity`}
              value={form.sensitivity}
              onChange={(value) =>
                update("sensitivity", value as AssetFormState["sensitivity"])
              }
              options={SENSITIVITY_OPTIONS}
            />
          </Field>

          <Field>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.mfa_required}
                onCheckedChange={(checked) =>
                  update("mfa_required", checked === true)
                }
              />
              MFA required
            </label>
          </Field>

          <Field>
            <FieldLabel htmlFor={`${idPrefix}-mfa-status`}>
              MFA status
            </FieldLabel>
            <EnumSelect
              id={`${idPrefix}-mfa-status`}
              value={form.mfa_status}
              onChange={(value) =>
                update("mfa_status", value as AssetFormState["mfa_status"])
              }
              options={MFA_STATUS_OPTIONS}
            />
          </Field>

          <Field>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.recovery_documented}
                onCheckedChange={(checked) =>
                  update("recovery_documented", checked === true)
                }
              />
              Recovery process documented
            </label>
          </Field>

          <Field>
            <FieldLabel htmlFor={`${idPrefix}-recovery-owner`}>
              Recovery owner
            </FieldLabel>
            <PersonSelect
              id={`${idPrefix}-recovery-owner`}
              people={people}
              value={form.recovery_owner_person_id}
              onChange={(personId) =>
                update("recovery_owner_person_id", personId)
              }
            />
          </Field>

          <Field>
            <FieldLabel htmlFor={`${idPrefix}-credential-location`}>
              Credential management location
            </FieldLabel>
            <EnumSelect
              id={`${idPrefix}-credential-location`}
              value={form.credential_management_location}
              onChange={(value) =>
                update(
                  "credential_management_location",
                  value as AssetFormState["credential_management_location"],
                )
              }
              options={CREDENTIAL_MANAGEMENT_LOCATION_OPTIONS}
            />
          </Field>
        </FieldGroup>
      </TabsContent>

      <TabsContent value="notes" className="mt-4">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor={`${idPrefix}-notes`}>Notes</FieldLabel>
            <Textarea
              id={`${idPrefix}-notes`}
              value={form.notes}
              onChange={(event) => update("notes", event.target.value)}
              rows={4}
            />
          </Field>
        </FieldGroup>
      </TabsContent>
    </Tabs>
  );
}
