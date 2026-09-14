/**
 * A label matcher that tolerates the required marker (#1070, #1071).
 *
 * `FieldLabel required` renders an aria-hidden "*" inside the `<label>`, and
 * testing-library's `getByLabelText` matches on `textContent` -- which, unlike
 * a real accessibility tree, includes that asterisk. So `getByLabelText("Name")`
 * stops matching the moment the field is marked required.
 *
 * This matches the label with or without the marker and nothing longer, so a
 * test never has to know whether the field it fills happens to be required.
 * The e2e suite has the same helper for Playwright in e2e/helpers/labels.ts.
 */
export function labelText(text: string): RegExp {
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^\\s*${escaped}\\s*\\*?\\s*$`);
}
