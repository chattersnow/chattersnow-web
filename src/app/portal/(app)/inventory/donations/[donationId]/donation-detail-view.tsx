import { categoryLabelFor } from "@/lib/inventory";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup, Field } from "@/components/ui/field";
import { ReadOnlyField } from "@/components/ui/read-only-field";
import {
  CONDITIONS,
  GENDERS,
  INTENDED_USES,
  SOURCE_TYPES,
  donorLabel,
  formatFaceValue,
  labelFor,
  type DonationRow,
} from "../donation-shared";
import { EditDonationSheet } from "./edit-donation-sheet";
import { formatInstantDate } from "@/lib/format";
import { EmptyState } from "@/components/portal/empty-state";

export function DonationDetailView({ donation }: { donation: DonationRow }) {
  return (
    <>
      <div>
        <div className="w-fit">
          <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
            {donorLabel(donation.donor)}
          </h1>
          <div className="rainbow-accent mt-3 w-full" />
        </div>
        <p className="app-muted mt-2 text-sm">
          Donation received {formatInstantDate(donation.donated_at)}
        </p>
      </div>

      <div className="rainbow-surface mt-6 flex flex-wrap items-center justify-end gap-2 rounded-xl border border-[var(--line)] p-4 shadow-md">
        <EditDonationSheet donation={donation} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="app-muted text-sm font-semibold">
              Donation details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <ReadOnlyField label="Donor" htmlFor="donation-donor">
                {donorLabel(donation.donor)}
              </ReadOnlyField>
              <Field orientation="responsive">
                <ReadOnlyField label="Donor source" htmlFor="donation-source">
                  {labelFor(SOURCE_TYPES, donation.donor.source_type) || "—"}
                </ReadOnlyField>
                <ReadOnlyField label="Source event" htmlFor="donation-event">
                  {donation.event?.name ?? "—"}
                </ReadOnlyField>
              </Field>
              <ReadOnlyField label="Date received" htmlFor="donation-donatedAt">
                {formatInstantDate(donation.donated_at)}
              </ReadOnlyField>
              <ReadOnlyField label="Donation notes" htmlFor="donation-notes">
                {donation.notes || "—"}
              </ReadOnlyField>
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="app-muted text-sm font-semibold">
              Items ({donation.inventory_items.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {donation.inventory_items.length === 0 ? (
              <EmptyState
                className="py-4"
                title="No items recorded for this donation"
                description="Open Edit donation to add the items that came with it."
              />
            ) : (
              <div className="flex flex-col gap-4">
                {donation.inventory_items.map((item, index) => (
                  <FieldGroup
                    key={item.id}
                    className="rounded-md border border-[var(--line)] p-4"
                  >
                    <p className="text-sm font-medium">Item {index + 1}</p>
                    <ReadOnlyField
                      label="Item description"
                      htmlFor={`item-description-${item.id}`}
                    >
                      {item.description}
                    </ReadOnlyField>
                    <Field orientation="responsive">
                      <ReadOnlyField
                        label="Item category"
                        htmlFor={`item-category-${item.id}`}
                      >
                        {categoryLabelFor(item)}
                      </ReadOnlyField>
                      <ReadOnlyField
                        label="Size"
                        htmlFor={`item-size-${item.id}`}
                      >
                        {item.size || "—"}
                      </ReadOnlyField>
                    </Field>
                    <Field orientation="responsive">
                      <ReadOnlyField
                        label="Gender"
                        htmlFor={`item-gender-${item.id}`}
                      >
                        {labelFor(GENDERS, item.gender) || "—"}
                      </ReadOnlyField>
                      <ReadOnlyField
                        label="Condition"
                        htmlFor={`item-condition-${item.id}`}
                      >
                        {labelFor(CONDITIONS, item.condition) || "—"}
                      </ReadOnlyField>
                    </Field>
                    <Field orientation="responsive">
                      <ReadOnlyField
                        label="Face value"
                        htmlFor={`item-faceValue-${item.id}`}
                      >
                        {formatFaceValue(item.face_value)}
                      </ReadOnlyField>
                      <ReadOnlyField
                        label="Intended use"
                        htmlFor={`item-intendedUse-${item.id}`}
                      >
                        {labelFor(INTENDED_USES, item.intended_use) || "—"}
                      </ReadOnlyField>
                    </Field>
                    <ReadOnlyField
                      label="Item notes"
                      htmlFor={`item-notes-${item.id}`}
                    >
                      {item.notes || "—"}
                    </ReadOnlyField>
                  </FieldGroup>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
