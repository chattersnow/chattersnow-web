import type { Metadata } from "next";
import { PeopleDirectory } from "./people-directory";
import { PEOPLE_SEGMENT } from "./people-segments";
import { segmentMetadata } from "./segment-metadata";

export async function generateMetadata(): Promise<Metadata> {
  return segmentMetadata(PEOPLE_SEGMENT);
}

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <PeopleDirectory segment={PEOPLE_SEGMENT} searchParams={searchParams} />
  );
}
