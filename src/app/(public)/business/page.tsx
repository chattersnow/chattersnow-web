import type { Metadata } from "next";
import { TourPage, tourMetadata } from "../tour-page";

export function generateMetadata(): Promise<Metadata> {
  return tourMetadata("For business");
}

export default function BusinessPage() {
  return <TourPage page="audience_business" />;
}
