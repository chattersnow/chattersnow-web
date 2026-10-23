import { describe, expect, test } from "bun:test";
import {
  defaultGrantAreas,
  eventAccessErrorMessage,
  splitGrantAreas,
  type EventAccessAreaOption,
} from "./event-access-shared";

const AREAS: EventAccessAreaOption[] = [
  {
    key: "details",
    label: "Details",
    description: "",
    sensitive: false,
    offered: true,
  },
  {
    key: "media",
    label: "Media",
    description: "",
    sensitive: false,
    offered: false,
  },
  {
    key: "expenses",
    label: "Expenses",
    description: "",
    sensitive: true,
    offered: true,
  },
  {
    key: "revenue",
    label: "Revenue",
    description: "",
    sensitive: true,
    offered: false,
  },
];

describe("defaultGrantAreas", () => {
  test("starts with the offered areas that are not sensitive", () => {
    expect(defaultGrantAreas(AREAS)).toEqual(["details"]);
  });
});

describe("splitGrantAreas", () => {
  test("separates a grant's live areas from those the tenant withdrew", () => {
    const { active, withdrawn } = splitGrantAreas(
      ["details", "media", "expenses"],
      AREAS,
    );
    expect(active.map((area) => area.key)).toEqual(["details", "expenses"]);
    expect(withdrawn.map((area) => area.key)).toEqual(["media"]);
  });
});

describe("eventAccessErrorMessage", () => {
  test("explains an area the tenant does not offer", () => {
    expect(
      eventAccessErrorMessage("EVENT_ACCESS_AREA_NOT_OFFERED", "fallback"),
    ).toContain("isn't offered");
  });

  test("falls back for anything else", () => {
    expect(eventAccessErrorMessage("boom", "fallback")).toBe("fallback");
    expect(eventAccessErrorMessage(undefined, "fallback")).toBe("fallback");
  });
});
