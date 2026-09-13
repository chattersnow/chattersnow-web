import { describe, expect, test } from "bun:test";
import {
  parsePublicTeamForm,
  PUBLIC_ROLE_MAX_LENGTH,
} from "./public-team-form";

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

describe("parsePublicTeamForm", () => {
  test("an empty form is a listing with nothing but the name", () => {
    expect(parsePublicTeamForm(form({}))).toEqual({
      data: { public_role: null, photo_url: null, bio: null, sort_order: null },
    });
  });

  test("keeps the paragraph breaks inside a bio and trims the ends", () => {
    const result = parsePublicTeamForm(
      form({
        publicRole: "  Programs lead ",
        photoUrl: "https://example.test/rowan.jpg",
        bio: "\n First.\n\nSecond. \n",
        sortOrder: "2",
      }),
    );
    expect(result).toEqual({
      data: {
        public_role: "Programs lead",
        photo_url: "https://example.test/rowan.jpg",
        bio: "First.\n\nSecond.",
        sort_order: 2,
      },
    });
  });

  test("mirrors the photo_url check so the constraint name never reaches the form", () => {
    expect(
      parsePublicTeamForm(form({ photoUrl: "example.test/x.jpg" })),
    ).toEqual({ error: "Photo URL must start with http:// or https://." });
    expect(
      parsePublicTeamForm(form({ photoUrl: "HTTPS://example.test/x.jpg" })),
    ).toHaveProperty("data.photo_url", "HTTPS://example.test/x.jpg");
  });

  test("order is a whole number or nothing", () => {
    expect(parsePublicTeamForm(form({ sortOrder: "1.5" }))).toEqual({
      error: "Order must be a whole number.",
    });
    expect(parsePublicTeamForm(form({ sortOrder: "abc" }))).toEqual({
      error: "Order must be a whole number.",
    });
    expect(parsePublicTeamForm(form({ sortOrder: " " }))).toHaveProperty(
      "data.sort_order",
      null,
    );
  });

  test("a role longer than one line is refused", () => {
    expect(
      parsePublicTeamForm(
        form({ publicRole: "x".repeat(PUBLIC_ROLE_MAX_LENGTH + 1) }),
      ),
    ).toEqual({
      error: `Role must be ${PUBLIC_ROLE_MAX_LENGTH} characters or fewer.`,
    });
  });
});
