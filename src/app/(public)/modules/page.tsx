import type { Metadata } from "next";
import { TourPage, tourMetadata } from "../tour-page";

export function generateMetadata(): Promise<Metadata> {
  return tourMetadata("What it does");
}

export default function ModulesPage() {
  return <TourPage page="module_tour" />;
}
