import type { Metadata } from "next";
import { PeopleDirectory } from "../people-directory";
import { ATTENDEES_SEGMENT } from "../people-segments";
import { segmentMetadata } from "../segment-metadata";

export async function generateMetadata(): Promise<Metadata> {
  return segmentMetadata(ATTENDEES_SEGMENT);
}

export default async function PeopleAttendeesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <PeopleDirectory segment={ATTENDEES_SEGMENT} searchParams={searchParams} />
  );
}
