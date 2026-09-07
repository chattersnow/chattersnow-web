import type { Metadata } from "next";
import { PeopleDirectory } from "../people/people-directory";
import { DONORS_SEGMENT } from "../people/people-segments";

export const metadata: Metadata = {
  title: "Donors",
};

export default async function DonorsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <PeopleDirectory segment={DONORS_SEGMENT} searchParams={searchParams} />
  );
}
