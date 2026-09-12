import { DEFAULT_LEXICON, applyLexicon, type Lexicon } from "@/lib/lexicon";

/**
 * The public contact form's topics: the stored value, and the label every
 * surface shows for it.
 *
 * One registry rather than two (#896). The form used to hold its own list and
 * this module a parallel map of labels, which was fine while both were
 * literals and stopped being fine the moment one of the labels became a
 * tenant's own word: a visitor would have chosen "Gear" on the form and the
 * portal would have filed it under "Items".
 *
 * The `value`s are the contract -- they are what `contact_messages.topic`
 * holds and what `?topic=` links across the site point at -- so they are never
 * renamed. The labels may carry `{term}` placeholders from the lexicon
 * registry; resolve them with `contactTopics()` or `contactTopicLabel()`
 * rather than reading `label` directly.
 */
export type ContactTopic = { value: string; label: string };

export const CONTACT_TOPICS: readonly ContactTopic[] = [
  { value: "general", label: "General inquiry" },
  { value: "partnership", label: "Partnerships & sponsorship" },
  { value: "volunteer", label: "Volunteering" },
  // The one topic that is about what the organization lends, so the one whose
  // label is theirs to choose. `gear` is the stored value and stays.
  { value: "gear", label: "{item_plural}" },
] as const;

/** The topics as this organization names them, for the form's picker. */
export function contactTopics(lexicon: Lexicon = DEFAULT_LEXICON) {
  return CONTACT_TOPICS.map((topic) => ({
    value: topic.value,
    label: applyLexicon(topic.label, lexicon),
  }));
}

/**
 * One topic's label, falling back to the stored value for a topic no longer in
 * the registry -- an old message must still say what it was about.
 *
 * Read by the portal's messages table and message sheet, and by the
 * notification email (#742), which is server-only send code with no business
 * importing out of the portal's route tree.
 */
export function contactTopicLabel(
  topic: string,
  lexicon: Lexicon = DEFAULT_LEXICON,
): string {
  const entry = CONTACT_TOPICS.find((candidate) => candidate.value === topic);
  return entry ? applyLexicon(entry.label, lexicon) : topic;
}
