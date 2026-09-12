import type { Metadata } from "next";
import { PeopleDirectory } from "../people-directory";
import { DONORS_SEGMENT } from "../people-segments";
import { segmentMetadata } from "../segment-metadata";

export async function generateMetadata(): Promise<Metadata> {
  return segmentMetadata(DONORS_SEGMENT);
}

export default async function PeopleDonorsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <PeopleDirectory segment={DONORS_SEGMENT} searchParams={searchParams} />
  );
}
