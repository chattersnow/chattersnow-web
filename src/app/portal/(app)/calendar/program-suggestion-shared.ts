export type ProgramSuggestionRule = {
  id: string;
  item_type: string | null;
  category: string | null;
  program_id: string;
  note: string | null;
};

/**
 * A rule matches when every non-null dimension it specifies matches the
 * item -- e.g. a category-only rule matches any item_type with that
 * category, an item_type-only rule matches any category with that type,
 * and a rule with both matches only items with both (the issue's trans-
 * observance example: community_observance + lgbtq_community).
 */
export function suggestedProgramIds(
  rules: ProgramSuggestionRule[],
  itemType: string,
  categories: string[],
  excludeProgramIds: string[],
): string[] {
  const matched = new Set<string>();
  for (const rule of rules) {
    const typeMatches = rule.item_type === null || rule.item_type === itemType;
    const categoryMatches =
      rule.category === null || categories.includes(rule.category);
    if (typeMatches && categoryMatches) matched.add(rule.program_id);
  }
  for (const id of excludeProgramIds) matched.delete(id);
  return [...matched];
}
