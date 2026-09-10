import { describe, expect, test } from "bun:test";
import { parseArtworkCallForm } from "./call-form";

function form(fields: Record<string, string>): FormData {
  const formData = new FormData();
  formData.set("eventId", "11111111-1111-4111-8111-111111111111");
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return formData;
}

describe("parseArtworkCallForm", () => {
  test("treats an absent checkbox as closed and an absent window as open-ended", () => {
    const result = parseArtworkCallForm(form({}));
    expect(result).toEqual({
      data: {
        eventId: "11111111-1111-4111-8111-111111111111",
        isOpen: false,
        opensAt: null,
        closesAt: null,
        intro: null,
        rightsNote: null,
        maxImages: 3,
      },
    });
  });

  test("reads the checkbox's 'on' and normalizes the window to instants", () => {
    const result = parseArtworkCallForm(
      form({ isOpen: "on", opensAt: "2026-10-01T09:00", maxImages: "5" }),
    );
    expect(result).toMatchObject({
      data: {
        isOpen: true,
        maxImages: 5,
        closesAt: null,
      },
    });
    expect("data" in result ? result.data.opensAt : null).toBe(
      new Date("2026-10-01T09:00").toISOString(),
    );
  });

  test("refuses an image count the check constraint would refuse", () => {
    expect(parseArtworkCallForm(form({ maxImages: "0" }))).toEqual({
      error: "Images per submission must be between 1 and 5.",
    });
    expect(parseArtworkCallForm(form({ maxImages: "6" }))).toEqual({
      error: "Images per submission must be between 1 and 5.",
    });
    expect(parseArtworkCallForm(form({ maxImages: "three" }))).toEqual({
      error: "Images per submission must be between 1 and 5.",
    });
  });

  test("keeps the rights note optional and trims it to null when blank", () => {
    expect(parseArtworkCallForm(form({ rightsNote: "   " }))).toMatchObject({
      data: { rightsNote: null },
    });
    expect(
      parseArtworkCallForm(form({ rightsNote: "  You keep the original.  " })),
    ).toMatchObject({
      data: { rightsNote: "You keep the original." },
    });
  });

  test("refuses a rights note longer than the brief can carry", () => {
    expect(parseArtworkCallForm(form({ rightsNote: "x".repeat(501) }))).toEqual(
      {
        error: "Please keep the rights and credit note under 500 characters.",
      },
    );
    expect(
      parseArtworkCallForm(form({ rightsNote: "x".repeat(500) })),
    ).toMatchObject({ data: { rightsNote: "x".repeat(500) } });
  });

  test("refuses a window that closes before it opens", () => {
    expect(
      parseArtworkCallForm(
        form({ opensAt: "2026-10-10T09:00", closesAt: "2026-10-01T09:00" }),
      ),
    ).toEqual({
      error: "The closing date cannot be before the opening date.",
    });
  });
});
