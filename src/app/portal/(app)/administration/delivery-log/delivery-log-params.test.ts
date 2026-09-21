import { describe, expect, test } from "bun:test";
import { PAGE_SIZE } from "@/lib/pagination";
import {
  activeDeliveryLogFilters,
  parseDeliveryLogParams,
  type DeliveryLogParams,
} from "./delivery-log-params";

const defaults = {
  sort: "created_at",
  dir: "desc",
  status: "all",
  kind: "all",
  recipient: "",
  record: "",
  from: "",
  to: "",
  page: 1,
  perPage: PAGE_SIZE,
} satisfies DeliveryLogParams;

describe("parseDeliveryLogParams", () => {
  test("falls back to defaults for an empty query string", () => {
    expect(parseDeliveryLogParams({})).toEqual(defaults);
  });

  test("round-trips every filter a shared link can carry", () => {
    expect(
      parseDeliveryLogParams({
        sort: "kind",
        dir: "asc",
        status: "failed",
        kind: "artwork_submission_confirmation",
        recipient: "alex@example.org",
        record: "8f1c2d3e",
        from: "2026-09-01",
        to: "2026-09-30",
        page: "3",
        perPage: "25",
      }),
    ).toEqual({
      sort: "kind",
      dir: "asc",
      status: "failed",
      kind: "artwork_submission_confirmation",
      recipient: "alex@example.org",
      record: "8f1c2d3e",
      from: "2026-09-01",
      to: "2026-09-30",
      page: 3,
      perPage: 25,
    });
  });

  test("takes the first value when a parameter is repeated", () => {
    const parsed = parseDeliveryLogParams({
      status: ["sent", "failed"],
      page: ["2", "9"],
    });
    expect(parsed.status).toBe("sent");
    expect(parsed.page).toBe(2);
  });

  test("ignores a status the ledger cannot hold", () => {
    expect(parseDeliveryLogParams({ status: "bounced" }).status).toBe("all");
  });

  test("ignores a kind no sender registers", () => {
    expect(parseDeliveryLogParams({ kind: "not_a_kind" }).kind).toBe("all");
  });

  test("falls back to created_at for an unsortable column", () => {
    expect(parseDeliveryLogParams({ sort: "error" }).sort).toBe("created_at");
  });

  // A pasted address or record id arrives with whitespace more often than not.
  test("trims the free-text filters", () => {
    const parsed = parseDeliveryLogParams({
      recipient: "  alex@example.org ",
      record: " 8f1c2d3e\n",
    });
    expect(parsed.recipient).toBe("alex@example.org");
    expect(parsed.record).toBe("8f1c2d3e");
  });
});

describe("activeDeliveryLogFilters", () => {
  test("counts nothing for the unfiltered view", () => {
    expect(activeDeliveryLogFilters(defaults).filter(Boolean)).toHaveLength(0);
  });

  test("counts each narrowed filter once", () => {
    const filters = parseDeliveryLogParams({
      status: "skipped",
      recipient: "alex",
      from: "2026-09-01",
    });
    expect(activeDeliveryLogFilters(filters).filter(Boolean)).toHaveLength(3);
  });

  // Sorting and paging are not filters: a reader who sorted by kind has not
  // narrowed anything, and offering them a Clear button would be a lie.
  test("does not count sort, direction or page", () => {
    const filters = parseDeliveryLogParams({
      sort: "kind",
      dir: "asc",
      page: "4",
      perPage: "25",
    });
    expect(activeDeliveryLogFilters(filters).filter(Boolean)).toHaveLength(0);
  });
});
