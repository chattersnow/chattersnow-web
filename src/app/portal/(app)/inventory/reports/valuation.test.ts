import { describe, expect, test } from "bun:test";
import {
  DONOR_BUCKETS,
  donorBucketFor,
  summarizeByStatus,
  summarizeByCategory,
  summarizeByCategoryGroup,
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

function item(
  category: string | null,
  group: string | null,
  status: string,
  faceValue: number | string | null,
  type: string | null = null,
) {
  return {
    type,
    // The key is the machine token, always lower_snake_case; the label is what
    // a human sees. categoryLabelFor keys the "Other" special case off the key.
    category_key: category && category.toLowerCase().replace(/ /g, "_"),
    category_label: category,
    category_group_label: group,
    status,
    face_value: faceValue,
  };
}

describe("summarizeByCategory", () => {
  const items = [
    item("Jacket", "Outerwear", "available", 40),
    item("Jacket", "Outerwear", "available", "60"),
    item("Boots", "Footwear", "available", 25),
    item("Jacket", "Outerwear", "distributed", 100),
    // Never categorized: still counted, under its legacy free text if it has
    // one and "Uncategorized" otherwise.
    item(null, null, "available", 10, "snow board"),
    item(null, null, "available", 5),
  ];

  test("only includes items matching the given status, summed per category", () => {
    expect(summarizeByCategory(items, "available")).toEqual([
      { group: "Outerwear", category: "Jacket", count: 2, totalValue: 100 },
      { group: "Footwear", category: "Boots", count: 1, totalValue: 25 },
      {
        group: "Uncategorized",
        category: "snow board",
        count: 1,
        totalValue: 10,
      },
      {
        group: "Uncategorized",
        category: "Uncategorized",
        count: 1,
        totalValue: 5,
      },
    ]);
  });

  test("groups spelling variants of one category into a single row", () => {
    // The bug this replaced: grouping on the raw free text made these three
    // rows instead of one.
    const variants = [
      item("Snowboard", "Hardgoods", "available", 10, "Snowboard"),
      item("Snowboard", "Hardgoods", "available", 10, "snowboard"),
      item("Snowboard", "Hardgoods", "available", 10, "snow board"),
    ];
    expect(summarizeByCategory(variants, "available")).toEqual([
      { group: "Hardgoods", category: "Snowboard", count: 3, totalValue: 30 },
    ]);
  });

  test("shows an Other item as its free-text detail", () => {
    const others = [item("Other", "Other", "available", 12, "Vintage poles")];
    expect(summarizeByCategory(others, "available")[0].category).toBe(
      "Vintage poles",
    );
  });

  test("sorts by total value descending", () => {
    const result = summarizeByCategory(items, "available");
    expect(result.map((row) => row.category)).toEqual([
      "Jacket",
      "Boots",
      "snow board",
      "Uncategorized",
    ]);
  });

  test("defaults to available status", () => {
    expect(summarizeByCategory(items)).toEqual(
      summarizeByCategory(items, "available"),
    );
  });
});

describe("summarizeByCategoryGroup", () => {
  const items = [
    item("Jacket", "Outerwear", "available", 40),
    item("Pants", "Outerwear", "available", 60),
    item("Boots", "Footwear", "available", 25),
  ];

  test("rolls the per-category totals up to their group", () => {
    expect(summarizeByCategoryGroup(items, "available")).toEqual([
      { group: "Outerwear", count: 2, totalValue: 100 },
      { group: "Footwear", count: 1, totalValue: 25 },
    ]);
  });

  test("totals the same as the per-category breakdown", () => {
    const groupTotal = summarizeByCategoryGroup(items).reduce(
      (sum, row) => sum + row.totalValue,
      0,
    );
    const categoryTotal = summarizeByCategory(items).reduce(
      (sum, row) => sum + row.totalValue,
      0,
    );
    expect(groupTotal).toBe(categoryTotal);
  });
});

describe("summarizeByStatus", () => {
  const statuses = ["available", "distributed", "lost"];
  const items = [
    item("Jacket", "Outerwear", "available", 40),
    item("Boots", "Footwear", "distributed", 25),
    item("Boots", "Footwear", "distributed", 25),
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
