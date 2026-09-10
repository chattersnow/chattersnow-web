import type { ParseResult } from "@/lib/forms";

export type ArtworkImageInput = {
  path: string;
  thumbPath: string;
  contentType: string;
  byteSize: number;
};

export type ArtworkFormData = {
  name: string;
  email: string;
  creditName: string;
  portfolio: string;
  title: string;
  medium: string;
  statement: string;
  consent: boolean;
  images: ArtworkImageInput[];
};

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

const IMAGES_UNREADABLE =
  "Something went wrong with your images. Please remove them and add them again.";

/**
 * Convenience validation only. `submit_artwork` re-checks every one of these,
 * including each image path against a pattern built from the resolved tenant
 * and event id, because `anon` reaches the tables through nothing else.
 */
export function parseArtworkForm(
  formData: FormData,
): ParseResult<ArtworkFormData> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const creditName = String(formData.get("creditName") ?? "").trim();
  const portfolio = String(formData.get("portfolio") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const medium = String(formData.get("medium") ?? "").trim();
  const statement = String(formData.get("statement") ?? "").trim();
  const consent = formData.get("consent") === "on";

  if (!name) return { error: "Your name is required." };
  if (name.length > 200) return { error: "That name is too long." };
  if (!email || !email.includes("@"))
    return { error: "A valid email is required." };
  if (creditName.length > 200)
    return { error: "That credit name is too long." };
  if (portfolio.length > 200) return { error: "That link is too long." };
  // Mirrors the column's check constraint. Anything without a scheme is taken
  // as a handle and left alone; anything with one has to be http(s), so a
  // reviewer's browser is never handed a javascript: or data: target.
  if (portfolio.includes("://") && !/^https?:\/\//i.test(portfolio)) {
    return { error: "A portfolio link has to start with http:// or https://." };
  }
  if (title.length > 200) return { error: "That title is too long." };
  if (medium.length > 200) return { error: "That medium is too long." };
  if (statement.length > 2000)
    return { error: "Please keep the description under 2000 characters." };
  // Last of the field checks and the only one that is not about shape: without
  // it there is no record that the artist said the work is theirs.
  if (!consent) {
    return {
      error:
        "Please confirm the work is yours and that you agree to the terms above.",
    };
  }

  let images: unknown;
  try {
    images = JSON.parse(String(formData.get("images") ?? "[]"));
  } catch {
    return { error: IMAGES_UNREADABLE };
  }
  if (!Array.isArray(images) || images.length === 0) {
    return { error: "Add at least one image of your work." };
  }

  const parsed: ArtworkImageInput[] = [];
  for (const entry of images) {
    if (typeof entry !== "object" || entry === null) {
      return { error: IMAGES_UNREADABLE };
    }
    const image = entry as Record<string, unknown>;
    if (
      typeof image.path !== "string" ||
      typeof image.thumbPath !== "string" ||
      typeof image.contentType !== "string" ||
      !ALLOWED_TYPES.includes(image.contentType)
    ) {
      return { error: IMAGES_UNREADABLE };
    }
    parsed.push({
      path: image.path,
      thumbPath: image.thumbPath,
      contentType: image.contentType,
      byteSize: typeof image.byteSize === "number" ? image.byteSize : 0,
    });
  }

  return {
    data: {
      name,
      email,
      creditName,
      portfolio,
      title,
      medium,
      statement,
      consent,
      images: parsed,
    },
  };
}
