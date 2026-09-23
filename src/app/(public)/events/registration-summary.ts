import type { MinorContactValues } from "@/components/minor-accompaniment-fields";
import { ATTENDED_BEFORE_OPTIONS } from "@/lib/attended-before";
import { ADULTS_ONLY_CONFIRMATION_LABEL } from "@/lib/adults-only";
import { PARTY_INCLUDES_MINOR_OPTIONS } from "@/lib/minors";
import type {
  OptionCounts,
  RegistrationOptionsQuestion,
} from "@/lib/registration-options";
import type { RegistrationSummaryRow } from "./registration-steps";

/**
 * The rows the review step (#1413) shows for answers both registration forms
 * share, so the two summaries read the same. An unanswered question is left
 * out rather than listed as blank: the summary is what they told us.
 */

function optionLabel(
  options: readonly { value: string; label: string }[],
  value: string,
): string | null {
  return options.find((option) => option.value === value)?.label ?? null;
}

/** "Have you been before?", or nothing when it was skipped. */
export function attendedBeforeRows(value: string): RegistrationSummaryRow[] {
  const label = optionLabel(ATTENDED_BEFORE_OPTIONS, value);
  return label ? [{ label: "Been before", value: label }] : [];
}

/**
 * Party size, the under-18 answer and its contacts, the riding answers where
 * they were asked (#1415), options, and notes -- the order step 2 asks them in.
 */
export function eventSummaryRows({
  partySize,
  partyIncludesMinor,
  minorContacts,
  adultsOnlyConfirmed = false,
  riding = [],
  registrationOptions,
  optionCounts,
  notes,
}: {
  partySize: string;
  partyIncludesMinor: string;
  minorContacts: MinorContactValues;
  /** #1417. Shown as confirmed only where the event asked and it was ticked. */
  adultsOnlyConfirmed?: boolean;
  riding?: RegistrationSummaryRow[];
  registrationOptions: RegistrationOptionsQuestion | null;
  optionCounts: OptionCounts;
  notes: string;
}): RegistrationSummaryRow[] {
  const rows: RegistrationSummaryRow[] = [
    { label: "Number attending", value: partySize.trim() || "1" },
  ];

  const minor = optionLabel(PARTY_INCLUDES_MINOR_OPTIONS, partyIncludesMinor);
  if (minor) rows.push({ label: "Anyone under 18", value: minor });
  if (partyIncludesMinor === "yes") {
    const contact = (name: string, phone: string) =>
      [name.trim(), phone.trim()].filter(Boolean).join(", ");
    rows.push(
      {
        label: "Accompanying adult",
        value: contact(
          minorContacts.accompanyingAdultName,
          minorContacts.accompanyingAdultPhone,
        ),
      },
      {
        label: "Emergency contact",
        value: contact(
          minorContacts.emergencyContactName,
          minorContacts.emergencyContactPhone,
        ),
      },
    );
  }

  if (adultsOnlyConfirmed) {
    rows.push({ label: "Ages", value: ADULTS_ONLY_CONFIRMATION_LABEL });
  }

  rows.push(...riding);

  if (registrationOptions) {
    const chosen = registrationOptions.options
      .filter((option) => (optionCounts[option.id] ?? 0) > 0)
      .map((option) => `${optionCounts[option.id]} × ${option.label}`);
    if (chosen.length > 0) {
      rows.push({
        label: registrationOptions.prompt,
        value: chosen.join(", "),
      });
    }
  }

  if (notes.trim()) rows.push({ label: "Notes", value: notes.trim() });
  return rows;
}
