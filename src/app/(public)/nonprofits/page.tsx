import type { Metadata } from "next";
import { AudiencePage, audienceMetadata } from "../audience-page";

export function generateMetadata(): Promise<Metadata> {
  return audienceMetadata("For nonprofits");
}

export default function NonprofitsPage() {
  return <AudiencePage page="audience_nonprofits" />;
}
