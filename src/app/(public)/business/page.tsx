import type { Metadata } from "next";
import { AudiencePage, audienceMetadata } from "../audience-page";

export function generateMetadata(): Promise<Metadata> {
  return audienceMetadata("For business");
}

export default function BusinessPage() {
  return <AudiencePage page="audience_business" />;
}
