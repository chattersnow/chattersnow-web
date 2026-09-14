/**
 * An exact label match that tolerates the required marker (#1070).
 *
 * `FieldLabel required` appends an aria-hidden "*" inside the `<label>`, and
 * Playwright's `getByLabel` matches the label's text -- marker included, since
 * it reads the DOM rather than the accessibility tree. So
 * `getByLabel("Name", { exact: true })`, which several specs use to tell "Name"
 * apart from "Your name" or "Ship to", stops matching the moment that field is
 * marked required.
 *
 * This matches the label with or without the marker and nothing longer, so a
 * spec never has to know whether the field it is filling happens to be
 * required. Use it wherever `{ exact: true }` was the point.
 */
export function exactLabel(text: string): RegExp {
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^\\s*${escaped}\\s*\\*?\\s*$`);
}
