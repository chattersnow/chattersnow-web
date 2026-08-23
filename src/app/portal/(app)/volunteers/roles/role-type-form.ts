export type ParseResult<T> = { data: T } | { error: string };

export type RoleTypeFormData = {
  name: string;
  description: string | null;
};

export function parseRoleTypeForm(formData: FormData): ParseResult<RoleTypeFormData> {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  if (!name) return { error: "Role name is required." };

  return { data: { name, description: description || null } };
}
