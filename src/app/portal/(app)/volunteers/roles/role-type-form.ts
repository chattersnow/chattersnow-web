import type { ParseResult } from "@/lib/forms";

export type RoleTypeFormData = {
  name: string;
  description: string | null;
  is_public: boolean;
};

export function parseRoleTypeForm(
  formData: FormData,
): ParseResult<RoleTypeFormData> {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const isPublic = formData.get("isPublic") === "on";

  if (!name) return { error: "Role name is required." };

  return {
    data: { name, description: description || null, is_public: isPublic },
  };
}
