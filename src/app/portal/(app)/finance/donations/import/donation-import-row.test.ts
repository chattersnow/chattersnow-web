import { describe, expect, test } from "bun:test";
import {
  guessMapping,
  mappingError,
  parseCsvHeaders,
  parseDonationImportCsv,
  parseDonationImportRow,
  parseMoney,
  pruneMapping,
  type DonationImportMapping,
} from "./donation-import-row";

const DENVER = "America/Denver";

const STRIPE: DonationImportMapping = {
  external_reference: "id",
  amount: "Net",
  gross_amount: "Amount",
  fee_amount: "Fee",
  received_at: "Created (UTC)",
};

function row(overrides: Record<string, string>) {
  return {
    id: "ch_1",
    Amount: "100.00",
    Fee: "3.20",
    Net: "96.80",
    "Created (UTC)": "2026-03-04T17:00:00Z",
    ...overrides,
  };
}

describe("parseMoney", () => {
  test("reads the shapes an export actually uses", () => {
    expect(parseMoney("100")).toBe(100);
    expect(parseMoney(" $1,250.00 ")).toBe(1250);
    expect(parseMoney("€45.50")).toBe(45.5);
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("   ")).toBeNull();
  });

  test("reads accounting parentheses as the negative they mean", () => {
    expect(parseMoney("(4.55)")).toBe(-4.55);
  });

  test("refuses anything else rather than guessing", () => {
    expect(parseMoney("n/a")).toBeUndefined();
    expect(parseMoney("12.3.4")).toBeUndefined();
    expect(parseMoney("--5")).toBeUndefined();
  });
});

describe("parseDonationImportRow — the gross/fee/amount arithmetic", () => {
  test("a file with all three is taken as it stands", () => {
    const result = parseDonationImportRow(row({}), 2, STRIPE, DENVER);
    expect(result).toMatchObject({
      data: { amount: 96.8, grossAmount: 100, feeAmount: 3.2 },
    });
  });

  test("gross and fee with no net column are subtracted", () => {
    const donorbox: DonationImportMapping = {
      external_reference: "Donation Id",
      gross_amount: "Amount",
      fee_amount: "Processing Fee",
      received_at: "Date",
    };
    const result = parseDonationImportRow(
      {
        "Donation Id": "d_7",
        Amount: "100.00",
        "Processing Fee": "5.45",
        Date: "2026-03-04T17:00:00Z",
      },
      2,
      donorbox,
      DENVER,
    );
    expect(result).toMatchObject({
      data: { amount: 94.55, grossAmount: 100, feeAmount: 5.45 },
    });
  });

  test("a gross with no fee column is what arrived — the donor covered the cost", () => {
    const zeffy: DonationImportMapping = {
      external_reference: "Payment ID",
      gross_amount: "Total",
      received_at: "Date",
    };
    const result = parseDonationImportRow(
      { "Payment ID": "z_9", Total: "100.00", Date: "2026-03-04T17:00:00Z" },
      2,
      zeffy,
      DENVER,
    );
    expect(result).toMatchObject({
      data: { amount: 100, grossAmount: 100, feeAmount: null },
    });
  });

  test("a file that disagrees with itself is refused rather than reconciled", () => {
    const result = parseDonationImportRow(
      row({ Net: "99.00" }),
      4,
      STRIPE,
      DENVER,
    );
    expect(result).toEqual({
      error: "row 4: 99.00 is not 100.00 minus 3.20",
    });
  });

  test("a refund line is refused — a negative gift is not an import", () => {
    const result = parseDonationImportRow(
      row({ Net: "(96.80)", Amount: "", Fee: "" }),
      5,
      STRIPE,
      DENVER,
    );
    expect(result).toEqual({
      error:
        "row 5: amount is negative — a refund is not an import (delete the gift instead)",
    });
  });

  test("no money column at all names the fix", () => {
    const result = parseDonationImportRow(
      { id: "ch_2", "Created (UTC)": "2026-03-04T17:00:00Z" },
      6,
      STRIPE,
      DENVER,
    );
    expect(result).toEqual({
      error: "row 6: no amount — map a net amount, or a gross amount and a fee",
    });
  });
});

describe("parseDonationImportRow — the organization's own day (#1065)", () => {
  test("an evening gift stays on the evening's date, not the next UTC day", () => {
    // 7pm on the last day of February in Denver is 02:00 UTC on 1 March. The
    // month it belongs to is February, which is the whole point of #1065.
    const result = parseDonationImportRow(
      row({ "Created (UTC)": "2026-03-01T02:00:00Z" }),
      2,
      STRIPE,
      DENVER,
    );
    expect(result).toMatchObject({ data: { receivedDate: "2026-02-28" } });
  });

  test("the same instant reported by a UTC organization is the next day", () => {
    const result = parseDonationImportRow(
      row({ "Created (UTC)": "2026-03-01T02:00:00Z" }),
      2,
      STRIPE,
      "UTC",
    );
    expect(result).toMatchObject({ data: { receivedDate: "2026-03-01" } });
  });

  test("the instant itself is kept alongside the day", () => {
    const result = parseDonationImportRow(row({}), 2, STRIPE, DENVER);
    expect(result).toMatchObject({
      data: { receivedAt: "2026-03-04T17:00:00.000Z" },
    });
  });
});

describe("parseDonationImportRow — rows that cannot be imported", () => {
  test("no transaction ID, which is the whole idempotency story", () => {
    expect(parseDonationImportRow(row({ id: "" }), 3, STRIPE, DENVER)).toEqual({
      error: "row 3: no transaction ID",
    });
  });

  test("an unreadable date says which cell", () => {
    expect(
      parseDonationImportRow(
        row({ "Created (UTC)": "last Tuesday" }),
        7,
        STRIPE,
        DENVER,
      ),
    ).toEqual({ error: `row 7: "last Tuesday" isn't a date we can read` });
  });

  test("an unreadable amount says which cell", () => {
    expect(
      parseDonationImportRow(row({ Net: "n/a" }), 8, STRIPE, DENVER),
    ).toEqual({ error: `row 8: "n/a" is not an amount` });
  });

  test("a wholly blank row is reported, not silently dropped", () => {
    expect(
      parseDonationImportRow(
        { id: "", Amount: "", Fee: "", Net: "", "Created (UTC)": "" },
        9,
        STRIPE,
        DENVER,
      ),
    ).toEqual({ error: "row 9: blank" });
  });

  test("notes come through only from the column the tenant mapped", () => {
    const withNotes = { ...STRIPE, notes: "Customer Description" };
    const result = parseDonationImportRow(
      { ...row({}), "Customer Description": "Jane Doe" },
      2,
      withNotes,
      DENVER,
    );
    expect(result).toMatchObject({ data: { notes: "Jane Doe" } });
    // Unmapped, the same cell is ignored: the import never carries a donor
    // into the record unless the tenant asked it to.
    const without = parseDonationImportRow(
      { ...row({}), "Customer Description": "Jane Doe" },
      2,
      STRIPE,
      DENVER,
    );
    expect(without).toMatchObject({ data: { notes: null } });
  });
});

describe("parseDonationImportCsv", () => {
  const csv = [
    "id,Amount,Fee,Net,Created (UTC)",
    "ch_1,100.00,3.20,96.80,2026-03-04T17:00:00Z",
    "ch_2,not money,,,2026-03-05T17:00:00Z",
    "ch_3,50.00,1.75,48.25,2026-03-06T17:00:00Z",
  ].join("\n");

  test("keeps the good rows and numbers the bad ones by their line in the file", () => {
    const { rows, totalRows, headers } = parseDonationImportCsv(
      csv,
      { ...STRIPE, gross_amount: "Amount" },
      DENVER,
    );
    expect(totalRows).toBe(3);
    expect(headers).toEqual(["id", "Amount", "Fee", "Net", "Created (UTC)"]);
    expect(rows[0]).toMatchObject({ data: { externalReference: "ch_1" } });
    expect(rows[1]).toEqual({
      error: `row 3: "not money" is not a gross amount`,
    });
    expect(rows[2]).toMatchObject({ data: { externalReference: "ch_3" } });
  });

  test("headers are trimmed, so the mapping's names match the row keys", () => {
    const padded =
      " id , Net , Created (UTC) \nch_9, 10.00 , 2026-03-04T17:00:00Z";
    const { rows } = parseDonationImportCsv(
      padded,
      {
        external_reference: "id",
        amount: "Net",
        received_at: "Created (UTC)",
      },
      DENVER,
    );
    expect(rows[0]).toMatchObject({
      data: { externalReference: "ch_9", amount: 10 },
    });
  });

  test("parseCsvHeaders reads the header row alone", () => {
    expect(parseCsvHeaders(csv)).toEqual([
      "id",
      "Amount",
      "Fee",
      "Net",
      "Created (UTC)",
    ]);
  });
});

describe("mappingError", () => {
  test("names the missing required field", () => {
    expect(mappingError({ amount: "Net", received_at: "Created (UTC)" })).toBe(
      "Choose which column holds transaction id.",
    );
    expect(mappingError({ external_reference: "id", amount: "Net" })).toBe(
      "Choose which column holds date received.",
    );
  });

  test("a gross and a fee stand in for a net amount", () => {
    expect(
      mappingError({
        external_reference: "id",
        received_at: "Created (UTC)",
      }),
    ).toBe(
      "Choose which column holds the net received, or map a gross amount and a fee.",
    );
    expect(
      mappingError({
        external_reference: "id",
        received_at: "Created (UTC)",
        gross_amount: "Amount",
      }),
    ).toBeNull();
  });

  test("catches one column mapped to two fields", () => {
    expect(
      mappingError({
        external_reference: "id",
        received_at: "Created (UTC)",
        amount: "Amount",
        gross_amount: "Amount",
      }),
    ).toBe("Two fields are mapped to the same column.");
  });
});

describe("guessMapping", () => {
  test("a Stripe export needs no pickers touched", () => {
    expect(
      guessMapping(["id", "Amount", "Fee", "Net", "Created (UTC)"]),
    ).toEqual({
      external_reference: "id",
      gross_amount: "Amount",
      fee_amount: "Fee",
      amount: "Net",
      received_at: "Created (UTC)",
    });
  });

  test("a file with a gross and a fee and no net maps both", () => {
    expect(
      guessMapping(["Donation Id", "Amount", "Processing Fee", "Date"]),
    ).toEqual({
      external_reference: "Donation Id",
      gross_amount: "Amount",
      fee_amount: "Processing Fee",
      received_at: "Date",
    });
  });

  test("never guesses a donor column into notes", () => {
    const guessed = guessMapping([
      "Payment ID",
      "Total",
      "Date",
      "Donor Name",
      "Donor Email",
    ]);
    expect(guessed.notes).toBeUndefined();
  });

  test("leaves a field alone rather than guessing from an unfamiliar header", () => {
    expect(guessMapping(["Ref", "Value", "When"])).toEqual({});
  });
});

describe("pruneMapping", () => {
  test("drops a remembered header this month's file no longer has", () => {
    expect(pruneMapping(STRIPE, ["id", "Net", "Created (UTC)"])).toEqual({
      external_reference: "id",
      amount: "Net",
      received_at: "Created (UTC)",
    });
  });
});
