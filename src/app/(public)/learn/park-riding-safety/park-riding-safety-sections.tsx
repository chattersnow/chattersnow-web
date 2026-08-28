import { LearnArticleSections } from "../learn-section";
import { PARK_SAFETY_ARTICLES } from "./park-riding-safety-data";

export function ParkRidingSafetySections() {
  return <LearnArticleSections articles={PARK_SAFETY_ARTICLES} />;
}
