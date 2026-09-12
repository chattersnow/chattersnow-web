import type { Metadata } from "next";
import { PeopleDirectory } from "../people-directory";
import { SPONSORS_SEGMENT } from "../people-segments";
import { segmentMetadata } from "../segment-metadata";

export async function generateMetadata(): Promise<Metadata> {
  return segmentMetadata(SPONSORS_SEGMENT);
}

export default async function PeopleSponsorsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <PeopleDirectory segment={SPONSORS_SEGMENT} searchParams={searchParams} />
  );
}
