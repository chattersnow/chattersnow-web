import type { ParseResult } from "@/lib/forms";
import {
  ACCESS_LEVELS,
  type AccessLevel,
} from "@/lib/portal/access-management/types";

export type AccessGrantFormData = {
  person_id: string;
  access_level: AccessLevel;
  account_identifier: string | null;
  purpose: string | null;
  expires_at: string | null;
  notes: string | null;
};

export function parseAccessGrantForm(
  formData: FormData,
): ParseResult<AccessGrantFormData> {
  const personId = String(formData.get("person_id") ?? "").trim();
  const accessLevel = String(formData.get("access_level") ?? "");

  if (!personId) return { error: "Select a person." };
  if (!(ACCESS_LEVELS as readonly string[]).includes(accessLevel)) {
    return { error: "Select a valid access level." };
  }

  return {
    data: {
      person_id: personId,
      access_level: accessLevel as AccessLevel,
      account_identifier:
        String(formData.get("account_identifier") ?? "").trim() || null,
      purpose: String(formData.get("purpose") ?? "").trim() || null,
      expires_at: String(formData.get("expires_at") ?? "").trim() || null,
      notes: String(formData.get("notes") ?? "").trim() || null,
    },
  };
}
