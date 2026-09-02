import { describe, expect, test } from "bun:test";
import {
  formatAmount,
  formatExpenseDate,
  getExpenseNextStepMessage,
  isSelfApprovalEligible,
  type ExpenseApprovalContext,
} from "./expenses-shared";

describe("formatAmount", () => {
  test("formats a numeric amount as currency", () => {
    expect(formatAmount(150.5, "USD")).toBe("$150.50");
  });

  test("formats a string amount as currency", () => {
    expect(formatAmount("150.5", "USD")).toBe("$150.50");
  });

  test("returns an em dash for a non-numeric string", () => {
    expect(formatAmount("not-a-number", "USD")).toBe("—");
  });

  test("falls back to a plain string for an unknown currency code", () => {
    expect(formatAmount(10, "NOTACODE")).toBe("NOTACODE 10.00");
  });
});

describe("formatExpenseDate", () => {
  test("formats a date-only string without a timezone shift", () => {
    expect(formatExpenseDate("2026-03-15")).toBe("Mar 15, 2026");
  });
});

describe("isSelfApprovalEligible", () => {
  test("is eligible below the threshold", () => {
    expect(isSelfApprovalEligible(100, 500)).toBe(true);
  });

  test("is not eligible at the threshold", () => {
    expect(isSelfApprovalEligible(500, 500)).toBe(false);
  });

  test("is not eligible above the threshold", () => {
    expect(isSelfApprovalEligible(600, 500)).toBe(false);
  });

  test("handles a string amount", () => {
    expect(isSelfApprovalEligible("100", 500)).toBe(true);
  });

  test("is not eligible when the amount is not a finite number", () => {
    expect(isSelfApprovalEligible("not-a-number", 500)).toBe(false);
  });
});

describe("getExpenseNextStepMessage", () => {
  const baseExpense = {
    status: "submitted" as const,
    submitted_by: "user-1",
    amount: 100,
    currency: "USD",
  };

  function context(
    overrides: Partial<ExpenseApprovalContext>,
  ): ExpenseApprovalContext {
    return {
      userId: "user-1",
      canApprove: false,
      canSelfApprove: false,
      canMarkPaid: false,
      threshold: 500,
      ...overrides,
    };
  }

  test("submitter below threshold can self-approve", () => {
    expect(
      getExpenseNextStepMessage(baseExpense, context({ canSelfApprove: true })),
    ).toBe("Below the $500.00 approval threshold — you can self-approve this.");
  });

  test("submitter at/above threshold needs a second approver", () => {
    expect(
      getExpenseNextStepMessage(
        { ...baseExpense, amount: 600 },
        context({ canSelfApprove: true }),
      ),
    ).toBe(
      "At or above the $500.00 approval threshold — you submitted this, so it needs approval from another admin or board member.",
    );
  });

  test("submitter without self-approval rights awaits approval", () => {
    expect(getExpenseNextStepMessage(baseExpense, context({}))).toBe(
      "You submitted this, so it needs approval from another admin or board member.",
    );
  });

  test("an approver viewing someone else's submission can act on it", () => {
    expect(
      getExpenseNextStepMessage(
        baseExpense,
        context({ userId: "user-2", canApprove: true }),
      ),
    ).toBe("Awaiting approval — you can approve or reject this.");
  });

  test("a non-approver viewing someone else's submission just waits", () => {
    expect(
      getExpenseNextStepMessage(baseExpense, context({ userId: "user-2" })),
    ).toBe("Awaiting approval from an admin or board member.");
  });

  test("falls back gracefully when no threshold is configured", () => {
    expect(
      getExpenseNextStepMessage(
        baseExpense,
        context({ canSelfApprove: true, threshold: null }),
      ),
    ).toBe(
      "You submitted this, so it needs approval from another admin or board member.",
    );
  });

  test("approved and markable as paid", () => {
    expect(
      getExpenseNextStepMessage(
        { ...baseExpense, status: "approved" },
        context({ canMarkPaid: true }),
      ),
    ).toBe("Approved — mark it as paid once payment has been sent.");
  });

  test("approved but viewer can't mark paid", () => {
    expect(
      getExpenseNextStepMessage(
        { ...baseExpense, status: "approved" },
        context({}),
      ),
    ).toBe("Approved — awaiting payment.");
  });

  test("rejected", () => {
    expect(
      getExpenseNextStepMessage(
        { ...baseExpense, status: "rejected" },
        context({}),
      ),
    ).toBe("Rejected. See the reason below.");
  });

  test("paid", () => {
    expect(
      getExpenseNextStepMessage(
        { ...baseExpense, status: "paid" },
        context({}),
      ),
    ).toBe("Paid. This expense is complete.");
  });
});
