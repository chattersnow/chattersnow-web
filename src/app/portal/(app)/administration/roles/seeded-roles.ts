export const SEEDED_ROLE_NAMES = ["admin", "event_coordinator", "finance", "board", "volunteer"] as const;

export function isSeededRole(name: string): boolean {
  return (SEEDED_ROLE_NAMES as readonly string[]).includes(name);
}
