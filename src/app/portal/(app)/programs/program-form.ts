export type ParseResult<T> = { data: T } | { error: string };

const STATUSES = ["active", "pilot", "retired"] as const;

export type ProgramFormData = {
  name: string;
  description: string | null;
  status: (typeof STATUSES)[number];
};

export function parseProgramForm(formData: FormData): ParseResult<ProgramFormData> {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const status = String(formData.get("status") ?? "");

  if (!name) return { error: "Program name is required." };
  if (!STATUSES.includes(status as (typeof STATUSES)[number])) {
    return { error: "Select a valid status." };
  }

  return {
    data: {
      name,
      description: description || null,
      status: status as (typeof STATUSES)[number],
    },
  };
}
