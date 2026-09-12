import type { Metadata } from "next";
import { PeopleDirectory } from "../people/people-directory";
import { STAFF_SEGMENT } from "../people/people-segments";
import { segmentMetadata } from "../people/segment-metadata";

export async function generateMetadata(): Promise<Metadata> {
  return segmentMetadata(STAFF_SEGMENT);
}

export default async function StaffPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <PeopleDirectory segment={STAFF_SEGMENT} searchParams={searchParams} />
  );
}
