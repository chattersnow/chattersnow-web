import type { PersonListItem } from "../people/actions";

export function filterPeople(people: PersonListItem[], query: string): PersonListItem[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return [];

  return people.filter(
    (person) =>
      (person.name ?? "").toLowerCase().includes(normalizedQuery) ||
      (person.email ?? "").toLowerCase().includes(normalizedQuery)
  );
}
