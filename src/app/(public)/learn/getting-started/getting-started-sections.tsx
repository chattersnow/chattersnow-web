import { LearnArticleSections } from "../learn-section";
import { GETTING_STARTED_ARTICLES } from "./getting-started-data";

export function GettingStartedSections() {
  return <LearnArticleSections articles={GETTING_STARTED_ARTICLES} />;
}
