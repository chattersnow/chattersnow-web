import { Card, CardContent } from "@/components/ui/card";
import { ViewerTime } from "@/components/viewer-time";

/**
 * Spelled out component by component rather than as `dateStyle`/`timeStyle`,
 * because Intl refuses to combine either of those with `timeZoneName` -- it
 * throws a RangeError rather than ignoring the option, and
 * formatDateTimeInZone's fallback re-throws it.
 *
 * The zone name is the part worth the verbosity. This is a cutoff, and
 * "11:59 PM" without a zone is exactly the kind of detail someone misses by a
 * day.
 */
const DEADLINE_FORMAT: Intl.DateTimeFormatOptions = {
  month: "long",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
};

/**
 * The terms of a call, above the form (#876).
 *
 * Deliberately a card while the form below it is not. A card separates one
 * thing from another, and this is the page's second kind of content -- scanned
 * facts rather than fields to fill in. The form is the only other thing on the
 * page, so a card around *it* would separate it from nothing while adding a
 * second layer of horizontal padding on a phone.
 *
 * Every row is a fact an artist needs before deciding whether to open their
 * files, in the order they need it. `rightsNote` is the one that can be absent:
 * a curator who has not written a rights line gets no row rather than a
 * placeholder, because a vague reassurance the organization has not actually
 * agreed to is worse than silence.
 */
export function CallBrief({
  closesAt,
  timeZone,
  maxImages,
  rightsNote,
}: {
  closesAt: string | null;
  timeZone: string;
  maxImages: number;
  rightsNote: string | null;
}) {
  const deadline = closesAt ? (
    <>
      {/* The viewer's own clock, not the call's. A deadline is not a place a
          reader travels to the way an event is -- the only clock they have to
          compare it against is their own, and a call with neither its own zone
          nor an event resolves to UTC, which is nobody's. `timeZone` is only
          the server paint's fallback, and the zone label stays on so that
          first moment is honest too. */}
      Submissions close{" "}
      <ViewerTime
        iso={closesAt}
        fallbackZone={timeZone}
        options={DEADLINE_FORMAT}
      />
      .
    </>
  ) : (
    // The wording the portal's own field description promises: a call with no
    // window is governed by its open switch alone, which is what a curator
    // wants when the deadline is "when we have enough".
    "Open until we have enough work — send yours before it closes."
  );

  return (
    <Card className="rainbow-surface">
      <CardContent>
        <dl className="grid gap-4 sm:grid-cols-2">
          <Term label="Deadline">{deadline}</Term>
          <Term label="What to send">
            Up to {maxImages} image{maxImages === 1 ? "" : "s"}, as JPEG, PNG or
            WebP, 10 MB each. Send the highest-resolution file you have — the
            zine is printed, and a screenshot will not survive it.
          </Term>
          {rightsNote && <Term label="Rights and credit">{rightsNote}</Term>}
          <Term label="What happens next">
            The team reads every submission and replies either way, to the email
            address you give below.
          </Term>
        </dl>
      </CardContent>
    </Card>
  );
}

function Term({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="app-eyebrow">{label}</dt>
      <dd className="mt-1.5 text-sm leading-relaxed">{children}</dd>
    </div>
  );
}
