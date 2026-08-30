"use client";

import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { PartnershipStage } from "./partnership-opportunity-form";

export const PARTNERSHIP_STAGE_LABELS: Record<PartnershipStage, string> = {
  prospecting: "Prospecting",
  contacted: "Contacted",
  proposal_sent: "Proposal sent",
  negotiating: "Negotiating",
  closed_won: "Closed — won",
  closed_lost: "Closed — lost",
};

export type PartnershipOpportunityFormState = {
  organizationName: string;
  contactName: string;
  contactEmail: string;
  stage: PartnershipStage;
  nextStepDate: string;
  notes: string;
};

export function emptyPartnershipOpportunityForm(): PartnershipOpportunityFormState {
  return {
    organizationName: "",
    contactName: "",
    contactEmail: "",
    stage: "prospecting",
    nextStepDate: "",
    notes: "",
  };
}

export function PartnershipOpportunityFormFields({
  form,
  update,
  idPrefix,
}: {
  form: PartnershipOpportunityFormState;
  update: <K extends keyof PartnershipOpportunityFormState>(
    key: K,
    value: PartnershipOpportunityFormState[K],
  ) => void;
  idPrefix: string;
}) {
  return (
    <>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-organization-name`}>
          Organization name
        </FieldLabel>
        <Input
          id={`${idPrefix}-organization-name`}
          required
          value={form.organizationName}
          onChange={(event) => update("organizationName", event.target.value)}
        />
      </Field>

      <Field orientation="responsive">
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-contact-name`}>
            Contact name
          </FieldLabel>
          <Input
            id={`${idPrefix}-contact-name`}
            value={form.contactName}
            onChange={(event) => update("contactName", event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-contact-email`}>
            Contact email
          </FieldLabel>
          <Input
            id={`${idPrefix}-contact-email`}
            type="email"
            value={form.contactEmail}
            onChange={(event) => update("contactEmail", event.target.value)}
          />
        </Field>
      </Field>

      <Field orientation="responsive">
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-stage`}>Stage</FieldLabel>
          <Select
            value={form.stage}
            onValueChange={(value) =>
              update("stage", value as PartnershipStage)
            }
          >
            <SelectTrigger id={`${idPrefix}-stage`}>
              <SelectValue placeholder="Stage" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(PARTNERSHIP_STAGE_LABELS).map(
                ([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-next-step-date`}>
            Next step date
          </FieldLabel>
          <Input
            id={`${idPrefix}-next-step-date`}
            type="date"
            value={form.nextStepDate}
            onChange={(event) => update("nextStepDate", event.target.value)}
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

export function packPartnershipOpportunityFormData(
  form: PartnershipOpportunityFormState,
) {
  const formData = new FormData();
  formData.set("organizationName", form.organizationName);
  formData.set("contactName", form.contactName);
  formData.set("contactEmail", form.contactEmail);
  formData.set("stage", form.stage);
  formData.set("nextStepDate", form.nextStepDate);
  formData.set("notes", form.notes);
  return formData;
}
