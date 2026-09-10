import { describe, expect, test } from "bun:test";
import { parseArtworkForm } from "./artwork-form";

function form(
  fields: Record<string, string>,
  images: unknown = [
    {
      path: "t/e/d/i.jpg",
      thumbPath: "t/e/d/i-thumb.jpg",
      contentType: "image/jpeg",
      byteSize: 1234,
    },
  ],
): FormData {
  const formData = new FormData();
  formData.set("name", "Ari Nakamura");
  formData.set("email", "ari@example.test");
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  if (images !== undefined) formData.set("images", JSON.stringify(images));
  return formData;
}

describe("parseArtworkForm", () => {
  test("trims the text fields and keeps the images", () => {
    const result = parseArtworkForm(
      form({ name: "  Ari  ", title: " Snowline ", medium: " Ink " }),
    );
    expect(result).toEqual({
      data: {
        name: "Ari",
        email: "ari@example.test",
        title: "Snowline",
        medium: "Ink",
        statement: "",
        images: [
          {
            path: "t/e/d/i.jpg",
            thumbPath: "t/e/d/i-thumb.jpg",
            contentType: "image/jpeg",
            byteSize: 1234,
          },
        ],
      },
    });
  });

  test("requires a name and a plausible email", () => {
    expect(parseArtworkForm(form({ name: "   " }))).toEqual({
      error: "Your name is required.",
    });
    expect(parseArtworkForm(form({ email: "not-an-address" }))).toEqual({
      error: "A valid email is required.",
    });
  });

  test("requires at least one image", () => {
    expect(parseArtworkForm(form({}, []))).toEqual({
      error: "Add at least one image of your work.",
    });
  });

  test("rejects a content type the bucket would refuse anyway", () => {
    const result = parseArtworkForm(
      form({}, [
        {
          path: "t/e/d/i.gif",
          thumbPath: "t/e/d/i-thumb.jpg",
          contentType: "image/gif",
          byteSize: 1,
        },
      ]),
    );
    expect(result).toEqual({
      error:
        "Something went wrong with your images. Please remove them and add them again.",
    });
  });

  test("survives an images field that is not JSON at all", () => {
    const formData = form({});
    formData.set("images", "{oh no");
    expect(parseArtworkForm(formData)).toEqual({
      error:
        "Something went wrong with your images. Please remove them and add them again.",
    });
  });

  test("caps the artist statement", () => {
    expect(parseArtworkForm(form({ statement: "x".repeat(2001) }))).toEqual({
      error: "Please keep the description under 2000 characters.",
    });
  });
});
