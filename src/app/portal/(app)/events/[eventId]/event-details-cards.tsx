import { formatDateTimeInZone } from "@/lib/time";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup } from "@/components/ui/field";
import { ReadOnlyField } from "@/components/ui/read-only-field";
import type { Program } from "../../programs/actions";
import type { EventLead } from "../actions";
import type { EventRow } from "../event-badges";

const DATE_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
  dateStyle: "medium",
  timeStyle: "short",
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function formatDatetimeLocal(value: string | null) {
  if (!value) return "—";
  return dateFormatter.format(new Date(value));
}

function formatCurrency(value: number | string | null) {
  if (value === null || value === undefined) return "—";
  const numeric = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(numeric) ? currencyFormatter.format(numeric) : "—";
}

export function EventDetailsCards({
  event,
  programs,
  eventLeads,
}: {
  event: EventRow;
  programs: Program[];
  eventLeads: EventLead[];
}) {
  const programName = programs.find(
    (program) => program.id === event.program_id,
  )?.name;
  const lead = eventLeads.find((lead) => lead.user_id === event.event_lead_id);
  const leadLabel = lead ? (lead.full_name ?? lead.email) : undefined;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="app-muted text-sm font-semibold">
            Event details
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <ReadOnlyField label="Program" htmlFor="event-details-program">
              {programName ?? "—"}
            </ReadOnlyField>
            <ReadOnlyField label="Location" htmlFor="event-details-location">
              {event.location || "—"}
            </ReadOnlyField>
            <Field orientation="responsive">
              <ReadOnlyField label="Starts" htmlFor="event-details-starts">
                {formatDateTimeInZone(
                  event.starts_at,
                  event.timezone,
                  DATE_FORMAT_OPTIONS,
                  "en-US",
                )}
              </ReadOnlyField>
              <ReadOnlyField label="Ends" htmlFor="event-details-ends">
                {event.ends_at
                  ? formatDateTimeInZone(
                      event.ends_at,
                      event.timezone,
                      DATE_FORMAT_OPTIONS,
                      "en-US",
                    )
                  : "—"}
              </ReadOnlyField>
            </Field>
            <ReadOnlyField label="Timezone" htmlFor="event-details-timezone">
              {event.timezone}
            </ReadOnlyField>
            <ReadOnlyField
              label="Description"
              htmlFor="event-details-description"
            >
              {event.description || "—"}
            </ReadOnlyField>
            <ReadOnlyField
              label="Flier image URL"
              htmlFor="event-details-flier"
            >
              {event.flier_url || "—"}
            </ReadOnlyField>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="app-muted text-sm font-semibold">
            Registration &amp; planning
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <ReadOnlyField label="Event lead" htmlFor="event-details-lead">
              {leadLabel ?? "—"}
            </ReadOnlyField>
            <Field orientation="responsive">
              <ReadOnlyField label="Capacity" htmlFor="event-details-capacity">
                {event.capacity ?? "—"}
              </ReadOnlyField>
              <ReadOnlyField label="Budget" htmlFor="event-details-budget">
                {formatCurrency(event.budget_amount)}
              </ReadOnlyField>
            </Field>
            <Field orientation="responsive">
              <ReadOnlyField
                label="Registration"
                htmlFor="event-details-registration"
              >
                {event.registration_enabled ? "Enabled" : "Disabled"}
              </ReadOnlyField>
              <ReadOnlyField
                label="Registration deadline"
                htmlFor="event-details-registration-deadline"
              >
                {formatDatetimeLocal(event.registration_deadline)}
              </ReadOnlyField>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>
    </div>
  );
}
