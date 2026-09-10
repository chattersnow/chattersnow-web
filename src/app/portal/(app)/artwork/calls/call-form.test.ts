import { describe, expect, test } from "bun:test";
import { parseArtworkCallForm } from "./call-form";

function form(fields: Record<string, string>): FormData {
  const formData = new FormData();
  formData.set("title", "Zine Vol. 2");
  formData.set("eventId", "11111111-1111-4111-8111-111111111111");
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return formData;
}

describe("parseArtworkCallForm", () => {
  test("treats an absent checkbox as closed and an absent window as open-ended", () => {
    const result = parseArtworkCallForm(form({}));
    expect(result).toEqual({
      data: {
        title: "Zine Vol. 2",
        eventId: "11111111-1111-4111-8111-111111111111",
        timezone: null,
        isOpen: false,
        opensAt: null,
        closesAt: null,
        intro: null,
        rightsNote: null,
        maxImages: 3,
      },
    });
  });

  test("accepts a call with no event and reports it as null", () => {
    const noEvent = form({});
    noEvent.set("eventId", "");
    expect(parseArtworkCallForm(noEvent)).toMatchObject({
      data: { eventId: null, title: "Zine Vol. 2" },
    });
  });

  test("insists on a title, which is the public page's only heading", () => {
    expect(parseArtworkCallForm(form({ title: "   " }))).toEqual({
      error: "Give the call a title.",
    });
    expect(parseArtworkCallForm(form({ title: "x".repeat(201) }))).toEqual({
      error: "Please keep the title under 200 characters.",
    });
  });

  // A typo here means a deadline stated in the wrong zone, and
  // formatDateTimeInZone swallows an unknown zone by falling back silently.
  test("refuses a timezone that is not one of the offered options", () => {
    expect(parseArtworkCallForm(form({ timezone: "Mars/Olympus" }))).toEqual({
      error: "That is not a timezone we recognise.",
    });
    expect(
      parseArtworkCallForm(form({ timezone: "America/Denver" })),
    ).toMatchObject({ data: { timezone: "America/Denver" } });
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
