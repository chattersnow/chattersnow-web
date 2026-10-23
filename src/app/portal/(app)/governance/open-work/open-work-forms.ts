import type {
  ActionItemRecord,
  AnnualRequirementRecord,
  MilestoneRecord,
} from "@/lib/portal/governance-open-work";

/**
 * The forms Open work's inline actions send to each source's existing update
 * action (#1658). Those actions replace the whole row from the form, so each
 * builder starts from the record as it stands and changes only what the
 * inline control changes -- a reassign must not clear a milestone's notes or
 * detach an annual requirement's document.
 *
 * Field names are the ones each source's own parser reads
 * (`parseActionItemForm`, `parseMilestoneForm`, `parseAnnualRequirementForm`
 * with `parseContentForm`).
 */
export type OwnerDueChange = { dueDate: string | null };

export function actionItemFormData(
  record: ActionItemRecord,
  change: OwnerDueChange,
): FormData {
  const fd = new FormData();
  fd.set("description", record.description);
  fd.set("dueDate", change.dueDate ?? "");
  fd.set("status", record.status);
  // No minutesItemKey: the parser leaves the link alone when none is sent.
  return fd;
}

export function milestoneFormData(
  record: MilestoneRecord,
  change: OwnerDueChange,
): FormData {
  const fd = new FormData();
  fd.set("description", record.description);
  fd.set("phase", record.phase);
  fd.set("status", record.status);
  fd.set("dueDate", change.dueDate ?? "");
  fd.set("notes", record.notes ?? "");
  return fd;
}

export function annualRequirementFormData(
  record: AnnualRequirementRecord,
  change: OwnerDueChange,
): FormData {
  const fd = new FormData();
  fd.set("name", record.name);
  // Required by the parser; a blank date is refused there, not here.
  fd.set("dueDate", change.dueDate ?? "");
  fd.set("status", record.status);
  fd.set("externalLink", record.external_link ?? "");
  fd.set("documentPath", record.document_path ?? "");
  fd.set("bodyText", record.body_text ?? "");
  return fd;
}
