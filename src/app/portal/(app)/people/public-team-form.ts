import { parseImageCrop, withImageCrop } from "@/lib/image-crop";

/**
 * The fields a person carries onto the public Meet the Team page (#1014), as
 * the card on their record submits them. Hand-rolled like `person-form.ts`:
 * the checks mirror the `public_team_members` constraints so a bad value is
 * refused with a sentence rather than a constraint name.
 */
export type PublicTeamFormData = {
  public_role: string | null;
  photo_url: string | null;
  bio: string | null;
  sort_order: number | null;
};

/** Long enough for "Co-founder and Director of Programs", short enough to stay one line. */
export const PUBLIC_ROLE_MAX_LENGTH = 120;

export function parsePublicTeamForm(
  formData: FormData,
): { error: string } | { data: PublicTeamFormData } {
  const publicRole = String(formData.get("publicRole") ?? "").trim();
  const photoUrl = String(formData.get("photoUrl") ?? "").trim();
  // Trimmed at the ends only: the blank lines inside are the paragraph
  // breaks the public page renders.
  const bio = String(formData.get("bio") ?? "").trim();
  const sortOrderRaw = String(formData.get("sortOrder") ?? "").trim();

  if (publicRole.length > PUBLIC_ROLE_MAX_LENGTH) {
    return {
      error: `Role must be ${PUBLIC_ROLE_MAX_LENGTH} characters or fewer.`,
    };
  }
  if (photoUrl && !/^https?:\/\//i.test(photoUrl)) {
    return { error: "Photo URL must start with http:// or https://." };
  }
  // Round-tripped through the crop encoding, so this save is where a stored
  // value is canonicalised: a rect is written back at the one precision the
  // editor's dirty check expects, and a rect covering the whole picture stops
  // being stored at all, since "never cropped" and "reset" have to be the same
  // string (#1251). A fragment the parser does not recognise is deliberately
  // left alone -- see `parseImageCrop`, which keeps it visible rather than
  // silently eating something it does not own.
  const { src, crop } = parseImageCrop(photoUrl);
  const photo = src ? withImageCrop(src, crop) : "";

  let sort_order: number | null = null;
  if (sortOrderRaw) {
    const parsed = Number(sortOrderRaw);
    if (!Number.isInteger(parsed)) {
      return { error: "Order must be a whole number." };
    }
    sort_order = parsed;
  }

  return {
    data: {
      public_role: publicRole || null,
      photo_url: photo || null,
      bio: bio || null,
      sort_order,
    },
  };
}
