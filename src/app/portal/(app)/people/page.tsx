import type { Metadata } from "next";
import { PeopleDirectory } from "./people-directory";
import { PEOPLE_SEGMENT } from "./people-segments";

export const metadata: Metadata = {
  title: "People",
};

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <PeopleDirectory segment={PEOPLE_SEGMENT} searchParams={searchParams} />
  );
}
