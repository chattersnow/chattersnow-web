// How a donation names its donor, in-kind and monetary alike (#1592).
//
// An anonymous donation has no donor: its donor_id is null, and "Anonymous"
// is only how that reads. A donor_id with no readable person behind it is a
// donor the reader may not see (people RLS), which is not the same thing and
// must not read as anonymous. An is_anonymous person -- one retention has
// scrubbed, or an anonymous intake from before #1592 -- reads as anonymous too.

export const ANONYMOUS_DONOR_LABEL = "Anonymous";

export type DonorLabelPerson = {
  name: string | null;
  is_anonymous?: boolean | null;
};

export function donorDisplayName(
  donorId: string | null | undefined,
  donor: DonorLabelPerson | null | undefined,
): string {
  if (!donorId || donor?.is_anonymous) return ANONYMOUS_DONOR_LABEL;
  return donor?.name?.trim() || "—";
}
