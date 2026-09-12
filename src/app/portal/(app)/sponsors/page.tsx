import type { Metadata } from "next";
import { PeopleDirectory } from "../people/people-directory";
import { SPONSORS_SEGMENT } from "../people/people-segments";
import { segmentMetadata } from "../people/segment-metadata";

export async function generateMetadata(): Promise<Metadata> {
  return segmentMetadata(SPONSORS_SEGMENT);
}

export default async function SponsorsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <PeopleDirectory segment={SPONSORS_SEGMENT} searchParams={searchParams} />
  );
}
