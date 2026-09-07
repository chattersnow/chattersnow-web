/**
 * Labels for the public contact form's topic values.
 *
 * Mirrors CONTACT_TOPICS in src/app/(public)/contact/contact-form.tsx -- the
 * form's own values are the only source of truth for the keys.
 *
 * In lib rather than beside the portal table that first needed it, because
 * three unrelated places now read it: the messages table, the message details
 * sheet, and the notification email (#742), which is server-only send code
 * that has no business importing out of the portal's route tree.
 */
export const CONTACT_TOPIC_LABELS: Record<string, string> = {
  general: "General inquiry",
  partnership: "Partnerships & sponsorship",
  volunteer: "Volunteering",
  gear: "Gear",
};
