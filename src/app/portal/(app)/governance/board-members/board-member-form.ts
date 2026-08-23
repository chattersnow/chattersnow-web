export type ParseResult<T> = { data: T } | { error: string };

export type BoardMemberFormData = {
  role_title: string;
  term_start: string;
  term_end: string | null;
  is_active: boolean;
  notes: string | null;
};

export function parseBoardMemberForm(formData: FormData): ParseResult<BoardMemberFormData> {
  const roleTitle = String(formData.get("roleTitle") ?? "").trim();
  const termStart = String(formData.get("termStart") ?? "").trim();
  const termEnd = String(formData.get("termEnd") ?? "").trim();
  const isActive = formData.get("isActive") === "true";
  const notes = String(formData.get("notes") ?? "").trim();

  if (!roleTitle) return { error: "Role/title is required." };
  if (!termStart) return { error: "Term start date is required." };
  if (termEnd && termEnd < termStart) {
    return { error: "Term end date must be on or after the term start date." };
  }

  return {
    data: {
      role_title: roleTitle,
      term_start: termStart,
      term_end: termEnd || null,
      is_active: isActive,
      notes: notes || null,
    },
  };
}
