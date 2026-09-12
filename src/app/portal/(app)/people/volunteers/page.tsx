import type { Metadata } from "next";
import { PeopleDirectory } from "../people-directory";
import { VOLUNTEERS_SEGMENT } from "../people-segments";
import { segmentMetadata } from "../segment-metadata";

export async function generateMetadata(): Promise<Metadata> {
  return segmentMetadata(VOLUNTEERS_SEGMENT);
}

export default async function PeopleVolunteersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <PeopleDirectory segment={VOLUNTEERS_SEGMENT} searchParams={searchParams} />
  );
}
