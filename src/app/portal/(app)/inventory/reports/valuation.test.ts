import { describe, expect, test } from "bun:test";
import {
  DONOR_BUCKETS,
  donorBucketFor,
  summarizeByStatus,
  summarizeByType,
  summarizeReceivedByDonorBucket,
  sumMovementValue,
  toNumber,
  type ValuationMovement,
} from "./valuation";

function received(
  sourceType: string | null,
  faceValue: number | string | null,
  quantity = 1,
): ValuationMovement {
  return {
    movement_type: "received",
    quantity,
    inventory_items: {
      face_value: faceValue,
      donations: { people: { source_type: sourceType } },
    },
  };
}

describe("toNumber", () => {
  test("coerces numeric strings", () => {
    expect(toNumber("42.5")).toBe(42.5);
  });

  test("returns 0 for null", () => {
    expect(toNumber(null)).toBe(0);
  });

  test("returns 0 for non-numeric strings", () => {
    expect(toNumber("abc")).toBe(0);
  });
});

describe("summarizeByType", () => {
  const items = [
    { type: "jacket", status: "available", face_value: 40 },
    { type: "jacket", status: "available", face_value: "60" },
    { type: "boots", status: "available", face_value: 25 },
    { type: "jacket", status: "distributed", face_value: 100 },
    { type: null, status: "available", face_value: 10 },
    { type: "  ", status: "available", face_value: 5 },
  ];

  test("only includes items matching the given status, summed and counted per type", () => {
    expect(summarizeByType(items, "available")).toEqual([
      { type: "jacket", count: 2, totalValue: 100 },
      { type: "boots", count: 1, totalValue: 25 },
      { type: "Unspecified", count: 2, totalValue: 15 },
    ]);
  });

  test("sorts by total value descending", () => {
    const result = summarizeByType(items, "available");
    expect(result.map((row) => row.type)).toEqual([
      "jacket",
      "boots",
      "Unspecified",
    ]);
  });

  test("defaults to available status", () => {
    expect(summarizeByType(items)).toEqual(summarizeByType(items, "available"));
  });
});

describe("summarizeByStatus", () => {
  const statuses = ["available", "distributed", "lost"];
  const items = [
    { type: "jacket", status: "available", face_value: 40 },
    { type: "boots", status: "distributed", face_value: 25 },
    { type: "boots", status: "distributed", face_value: 25 },
  ];

  test("zero-fills statuses with no items", () => {
    expect(summarizeByStatus(items, statuses)).toEqual([
      { status: "available", count: 1, totalValue: 40 },
      { status: "distributed", count: 2, totalValue: 50 },
      { status: "lost", count: 0, totalValue: 0 },
    ]);
  });

  test("preserves the given status order", () => {
    const result = summarizeByStatus(items, statuses);
    expect(result.map((row) => row.status)).toEqual(statuses);
  });
});

describe("sumMovementValue", () => {
  const movements: ValuationMovement[] = [
    received("individual", 50),
    received("individual", "30", 2),
    {
      movement_type: "distributed",
      quantity: 1,
      inventory_items: { face_value: 20, donations: null },
    },
    { movement_type: "received", quantity: 1, inventory_items: null },
  ];

  test("sums face_value * quantity for matching movement types", () => {
    expect(sumMovementValue(movements, "received")).toBe(110);
  });

  test("treats a missing embedded item as zero value", () => {
    expect(sumMovementValue(movements, "received")).not.toBeNaN();
  });

  test("returns 0 when no movements match", () => {
    expect(sumMovementValue(movements, "lost")).toBe(0);
  });
});

describe("donorBucketFor", () => {
  test("groups brands and organizations as sponsors", () => {
    expect(donorBucketFor("brand")).toBe("sponsor");
    expect(donorBucketFor("organization")).toBe("sponsor");
  });

  test("keeps individuals separate", () => {
    expect(donorBucketFor("individual")).toBe("individual");
  });

  test("groups event and other donors as other", () => {
    expect(donorBucketFor("event")).toBe("other");
    expect(donorBucketFor("other")).toBe("other");
  });

  test("treats a missing or unknown source type as unattributed", () => {
    expect(donorBucketFor(null)).toBe("unattributed");
    expect(donorBucketFor(undefined)).toBe("unattributed");
    expect(donorBucketFor("foundation")).toBe("unattributed");
  });
});

describe("summarizeReceivedByDonorBucket", () => {
  const movements: ValuationMovement[] = [
    received("brand", 100),
    received("organization", "50", 2),
    received("individual", 40),
    received("event", 10),
    received("other", 5),
    {
      movement_type: "distributed",
      quantity: 1,
      inventory_items: {
        face_value: 999,
        donations: { people: { source_type: "brand" } },
      },
    },
  ];

  test("buckets received value and quantity by donor source type", () => {
    expect(summarizeReceivedByDonorBucket(movements)).toEqual([
      {
        bucket: "sponsor",
        label: "Sponsors & orgs",
        count: 3,
        totalValue: 200,
      },
      { bucket: "individual", label: "Individuals", count: 1, totalValue: 40 },
      { bucket: "other", label: "Other", count: 2, totalValue: 15 },
      {
        bucket: "unattributed",
        label: "Unattributed",
        count: 0,
        totalValue: 0,
      },
    ]);
  });

  test("excludes movements that are not received", () => {
    const sponsor = summarizeReceivedByDonorBucket(movements)[0];
    expect(sponsor.totalValue).toBe(200);
  });

  test("bucket totals sum to the Value donated card figure", () => {
    const bucketed = summarizeReceivedByDonorBucket(movements).reduce(
      (total, row) => total + row.totalValue,
      0,
    );
    expect(bucketed).toBe(sumMovementValue(movements, "received"));
  });

  test("counts an unreadable donation or donor as unattributed", () => {
    const hidden: ValuationMovement[] = [
      { movement_type: "received", quantity: 1, inventory_items: null },
      {
        movement_type: "received",
        quantity: 1,
        inventory_items: { face_value: 20, donations: null },
      },
      {
        movement_type: "received",
        quantity: 1,
        inventory_items: { face_value: 30, donations: { people: null } },
      },
    ];
    const result = summarizeReceivedByDonorBucket(hidden);
    expect(result.find((row) => row.bucket === "unattributed")).toEqual({
      bucket: "unattributed",
      label: "Unattributed",
      count: 3,
      totalValue: 50,
    });
    expect(result.find((row) => row.bucket === "individual")?.count).toBe(0);
  });

  test("zero-fills every bucket and preserves DONOR_BUCKETS order", () => {
    const result = summarizeReceivedByDonorBucket([]);
    expect(result.map((row) => row.bucket)).toEqual(
      DONOR_BUCKETS.map((bucket) => bucket.value),
    );
    expect(result.every((row) => row.count === 0 && row.totalValue === 0)).toBe(
      true,
    );
  });
});
