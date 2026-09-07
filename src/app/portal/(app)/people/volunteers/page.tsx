import type { Metadata } from "next";
import { PeopleDirectory } from "../people-directory";
import { VOLUNTEERS_SEGMENT } from "../people-segments";

export const metadata: Metadata = {
  title: "Volunteers",
};

export default async function PeopleVolunteersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <PeopleDirectory segment={VOLUNTEERS_SEGMENT} searchParams={searchParams} />
  );
}
