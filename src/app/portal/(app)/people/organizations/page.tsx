import type { Metadata } from "next";
import { PeopleDirectory } from "../people-directory";
import { ORGANIZATIONS_SEGMENT } from "../people-segments";
import { segmentMetadata } from "../segment-metadata";

export async function generateMetadata(): Promise<Metadata> {
  return segmentMetadata(ORGANIZATIONS_SEGMENT);
}

export default async function PeopleOrganizationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <PeopleDirectory
      segment={ORGANIZATIONS_SEGMENT}
      searchParams={searchParams}
    />
  );
}
