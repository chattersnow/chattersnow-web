import type { Metadata } from "next";
import { PeopleDirectory } from "../people-directory";
import { STAFF_SEGMENT } from "../people-segments";
import { segmentMetadata } from "../segment-metadata";

export async function generateMetadata(): Promise<Metadata> {
  return segmentMetadata(STAFF_SEGMENT);
}

export default async function PeopleStaffPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <PeopleDirectory segment={STAFF_SEGMENT} searchParams={searchParams} />
  );
}
