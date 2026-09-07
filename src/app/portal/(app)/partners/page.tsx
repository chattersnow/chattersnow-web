import type { Metadata } from "next";
import { PeopleDirectory } from "../people/people-directory";
import { PARTNERS_SEGMENT } from "../people/people-segments";

export const metadata: Metadata = {
  title: "Partners",
};

export default async function PartnersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <PeopleDirectory segment={PARTNERS_SEGMENT} searchParams={searchParams} />
  );
}
