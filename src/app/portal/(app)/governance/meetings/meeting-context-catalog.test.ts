// The mapping is keyed on the seeded section keys and lives in code, so the
// cases worth asserting are the ones a tenant can reach: a renamed section, a
// section nobody mapped, and a key that is not a section at all. None of them
// is an error -- a board that renamed "Finance & Fundraising" gets an agenda
// with no context block under it, not a broken page.
import { describe, expect, test } from "bun:test";
import {
  contextSourcesForItem,
  isContextUnavailable,
  SECTION_CONTEXT_SOURCES,
  TOPIC_CONTEXT_ROW_LIMIT,
  type FinanceActivityContext,
} from "./meeting-context-catalog";

describe("contextSourcesForItem", () => {
  test("resolves a section key through its `section:` prefix", () => {
    expect(contextSourcesForItem("section:finance_fundraising")).toEqual([
      "finance_activity",
      "grants",
    ]);
    expect(contextSourcesForItem("section:legal_nonprofit")).toEqual([
      "nonprofit_compliance",
    ]);
  });

  test("gives a renamed section no sources rather than an error", () => {
    // What a tenant that edited its template outside the portal actually has.
    expect(contextSourcesForItem("section:money_matters")).toEqual([]);
  });

  test("gives a seeded section nobody mapped no sources", () => {
    // marketing_social and operations are deliberately unmapped: the summaries
    // exist, but the value is thin against a board's attention.
    expect(contextSourcesForItem("section:marketing_social")).toEqual([]);
    expect(contextSourcesForItem("section:operations")).toEqual([]);
  });

  test("ignores items that are not sections", () => {
    for (const key of [
      "opening",
      "carried_over",
      "decisions",
      "new_business:0",
      "upcoming_dates",
      "parking_lot",
      "next_meeting",
    ]) {
      expect(contextSourcesForItem(key)).toEqual([]);
    }
  });

  test("does not match a bare section key", () => {
    // The agenda tab and the minutes snapshot both qualify the key, and
    // accepting the bare form would let `opening` collide with a section
    // someone named `opening`.
    expect(contextSourcesForItem("finance_fundraising")).toEqual([]);
  });

  test("maps every listed section to at least one source", () => {
    for (const [key, sources] of Object.entries(SECTION_CONTEXT_SOURCES)) {
      expect(sources.length, `${key} has no sources`).toBeGreaterThan(0);
    }
  });
});

describe("isContextUnavailable", () => {
  test("separates a payload from the reason there is none", () => {
    const finance: FinanceActivityContext = {
      window: { fromDate: "2026-06-01", toDate: "2026-09-01" },
      income: 0,
      cashDonations: 0,
      paidSpend: 0,
      net: 0,
      approvedUnpaidSpend: 0,
      pendingSpend: 0,
      outstandingReimbursements: null,
      upcomingEventBudget: null,
    };

    // All-zero finance is a real answer -- "nothing moved" -- and must not be
    // confused with "you cannot see what moved".
    expect(isContextUnavailable(finance)).toBe(false);
    expect(isContextUnavailable({ unavailable: "forbidden" })).toBe(true);
  });
});

test("shows a handful of rows before deferring to the module page", () => {
  expect(TOPIC_CONTEXT_ROW_LIMIT).toBe(3);
});
