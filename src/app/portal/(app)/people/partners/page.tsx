import type { Metadata } from "next";
import { PeopleDirectory } from "../people-directory";
import { PARTNERS_SEGMENT } from "../people-segments";
import { segmentMetadata } from "../segment-metadata";

export async function generateMetadata(): Promise<Metadata> {
  return segmentMetadata(PARTNERS_SEGMENT);
}

export default async function PeoplePartnersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <PeopleDirectory segment={PARTNERS_SEGMENT} searchParams={searchParams} />
  );
}
