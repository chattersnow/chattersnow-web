import { personDisplayName } from "@/lib/format";
import {
  CLAIM_FILTER_PARAM,
  claimFilterValue,
  type ClaimFilter,
} from "@/lib/queue-claims";
import type { ClaimStaffMember } from "@/lib/portal/queue-claim-context";

/**
 * The All / Unclaimed / Mine / person filter for a queue list (#1668), as a
 * field in the page's own GET form. The value lands in the URL as
 * `claimed=none|mine|<person id>` and the page applies it server-side.
 */
export function QueueClaimFilterField({
  filter,
  staff,
  selectClassName,
  labelClassName = "text-sm font-medium",
  className = "flex min-w-40 flex-col gap-1",
}: {
  filter: ClaimFilter;
  staff: ClaimStaffMember[];
  selectClassName: string;
  /** For a form whose other labels are styled differently, e.g. a filters sheet. */
  labelClassName?: string;
  className?: string;
}) {
  const value = claimFilterValue(filter);
  // A person who has since lost portal access can still be the filter in a
  // shared link; keep them selectable rather than silently showing "All".
  const filteredPerson =
    filter.kind === "person" &&
    !staff.some((person) => person.id === filter.personId);

  return (
    <div className={className}>
      <label htmlFor="queue-claimed" className={labelClassName}>
        Claimed by
      </label>
      <select
        id="queue-claimed"
        name={CLAIM_FILTER_PARAM}
        defaultValue={value}
        className={selectClassName}
      >
        <option value="all">All</option>
        <option value="none">Unclaimed</option>
        <option value="mine">Mine</option>
        {staff.map((person) => (
          <option key={person.id} value={person.id}>
            {personDisplayName(person)}
          </option>
        ))}
        {filteredPerson ? <option value={value}>Someone else</option> : null}
      </select>
    </div>
  );
}
