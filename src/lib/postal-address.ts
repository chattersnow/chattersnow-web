/**
 * A person's postal address as one line (#1164).
 *
 * The six columns are flattened on `people` so that the audit redaction
 * register and the retention purge can name them; nothing else wants them
 * apart, so every reader that shows an address shows it joined.
 *
 * Empty parts are dropped rather than rendered as gaps: most records have a
 * city and a region and nothing else, and "— , NY —" is worse than "NY".
 * Returns null when there is nothing at all, so a caller can render its own
 * placeholder rather than an empty string that reads as a bug.
 */
export type PostalAddressParts = {
  address_line1?: string | null;
  address_line2?: string | null;
  address_city?: string | null;
  address_region?: string | null;
  address_postal_code?: string | null;
  address_country?: string | null;
};

export function formatAddress(parts: PostalAddressParts): string | null {
  const line = [parts.address_line1, parts.address_line2]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(", ");

  // City and region belong together with no comma between them where only one
  // is present, which is the common case: "Brooklyn", not "Brooklyn, ".
  const locality = [parts.address_city, parts.address_region]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(", ");

  const localityWithCode = [locality, parts.address_postal_code?.trim()]
    .filter(Boolean)
    .join(" ");

  const joined = [line, localityWithCode, parts.address_country?.trim()]
    .filter(Boolean)
    .join(", ");

  return joined || null;
}
