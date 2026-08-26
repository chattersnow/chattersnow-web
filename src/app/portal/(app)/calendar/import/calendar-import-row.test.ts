import { describe, expect, test } from "bun:test";
import {
  parseCalendarImportRow,
  parseCalendarImportCsv,
} from "./calendar-import-row";

const validRow = {
  title: "GLAAD Spirit Day",
  item_type: "community_observance",
  starts_at: "2027-10-21T00:00:00Z",
  ends_at: "",
  time_zone: "America/Denver",
  recurrence_rule: "Annually, third Thursday of October",
  priority_tier: "2",
  category: "lgbtq_community",
  region: "us",
};

describe("parseCalendarImportRow", () => {
  test("parses a valid row", () => {
    const result = parseCalendarImportRow(validRow, 2);
    expect("data" in result).toBe(true);
    if ("data" in result) {
      expect(result.data.title).toBe("GLAAD Spirit Day");
      expect(result.data.itemType).toBe("community_observance");
      expect(result.data.priorityTier).toBe(2);
      expect(result.data.category).toBe("lgbtq_community");
      expect(result.data.region).toBe("us");
      expect(result.data.endsAt).toBeNull();
    }
  });

  test("treats a fully blank row as blank, not a missing-field error", () => {
    const result = parseCalendarImportRow({}, 5);
    expect(result).toEqual({ error: "row 5: blank" });
  });

  test("requires a title", () => {
    const result = parseCalendarImportRow({ ...validRow, title: "" }, 3);
    expect(result).toEqual({ error: "row 3: title is required" });
  });

  test("rejects an invalid item_type", () => {
    const result = parseCalendarImportRow(
      { ...validRow, item_type: "bogus" },
      3,
    );
    expect("error" in result && result.error.includes("item_type")).toBe(true);
  });

  test("rejects an unparseable starts_at", () => {
    const result = parseCalendarImportRow(
      { ...validRow, starts_at: "not-a-date" },
      3,
    );
    expect("error" in result && result.error.includes("starts_at")).toBe(true);
  });

  test("rejects an ends_at before starts_at", () => {
    const result = parseCalendarImportRow(
      { ...validRow, ends_at: "2027-10-20T00:00:00Z" },
      3,
    );
    expect("error" in result && result.error.includes("ends_at")).toBe(true);
  });

  test("rejects an invalid IANA time zone", () => {
    const result = parseCalendarImportRow(
      { ...validRow, time_zone: "Not/AZone" },
      3,
    );
    expect("error" in result && result.error.includes("time_zone")).toBe(true);
  });

  test("rejects an out-of-range priority_tier", () => {
    const result = parseCalendarImportRow(
      { ...validRow, priority_tier: "5" },
      3,
    );
    expect("error" in result && result.error.includes("priority_tier")).toBe(
      true,
    );
  });

  test("rejects an invalid category", () => {
    const result = parseCalendarImportRow(
      { ...validRow, category: "bogus" },
      3,
    );
    expect("error" in result && result.error.includes("category")).toBe(true);
  });
});

describe("parseCalendarImportCsv", () => {
  test("parses multiple rows and reports the total", () => {
    const csv = [
      "title,item_type,starts_at,ends_at,time_zone,recurrence_rule,priority_tier,category,region",
      `"${validRow.title}",${validRow.item_type},${validRow.starts_at},,${validRow.time_zone},"${validRow.recurrence_rule}",${validRow.priority_tier},${validRow.category},${validRow.region}`,
      ",,,,,,,,",
    ].join("\n");

    const { rows, totalRows } = parseCalendarImportCsv(csv);
    expect(totalRows).toBe(2);
    expect("data" in rows[0]).toBe(true);
    expect(rows[1]).toEqual({ error: "row 3: blank" });
  });
});
