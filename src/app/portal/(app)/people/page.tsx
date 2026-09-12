import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PeopleDirectory } from "./people-directory";
import { PEOPLE_SEGMENT, segmentForRole } from "./people-segments";
import { segmentMetadata } from "./segment-metadata";

export async function generateMetadata(): Promise<Metadata> {
  return segmentMetadata(PEOPLE_SEGMENT);
}

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  // `?role=is_donor` was the full directory's own way of doing what the
  // segment strip does since #957, and keeping both would have been the
  // two-ways-to-do-one-thing the ticket asked to avoid. The parameter stays
  // as an alias rather than being ignored: it is in bookmarks and in links
  // written before the strip existed, and silently showing everybody would be
  // worse than either honouring it or refusing it.
  const role = params.role;
  const named = segmentForRole(Array.isArray(role) ? role[0] : (role ?? ""));
  if (named) {
    const rest = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (key === "role") continue;
      if (typeof value === "string") rest.set(key, value);
      else if (Array.isArray(value)) for (const v of value) rest.append(key, v);
    }
    const query = rest.toString();
    redirect(`${named.basePath}${query ? `?${query}` : ""}`);
  }

  return (
    <PeopleDirectory segment={PEOPLE_SEGMENT} searchParams={searchParams} />
  );
}
