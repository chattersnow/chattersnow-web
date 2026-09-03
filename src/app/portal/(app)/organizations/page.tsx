import type { Metadata } from "next";
import { PeopleDirectory } from "../people/people-directory";
import { ORGANIZATIONS_SEGMENT } from "../people/people-segments";

export const metadata: Metadata = {
  title: "Organizations",
};

export default async function OrganizationsPage({
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
