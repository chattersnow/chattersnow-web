export function friendlyError(error: { code?: string }, duplicateMessage: string, fallback: string): string {
  return error.code === "23505" ? duplicateMessage : fallback;
}
