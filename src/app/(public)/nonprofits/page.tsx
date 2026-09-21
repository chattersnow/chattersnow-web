import type { Metadata } from "next";
import { TourPage, tourMetadata } from "../tour-page";

export function generateMetadata(): Promise<Metadata> {
  return tourMetadata("For nonprofits");
}

export default function NonprofitsPage() {
  return <TourPage page="audience_nonprofits" />;
}
