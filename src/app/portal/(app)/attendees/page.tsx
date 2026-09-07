import type { Metadata } from "next";
import { PeopleDirectory } from "../people/people-directory";
import { ATTENDEES_SEGMENT } from "../people/people-segments";

export const metadata: Metadata = {
  title: "Attendees",
};

export default async function AttendeesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <PeopleDirectory segment={ATTENDEES_SEGMENT} searchParams={searchParams} />
  );
}
