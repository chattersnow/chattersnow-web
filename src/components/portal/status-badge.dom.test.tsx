import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { humanizeStatus, StatusBadge } from "./status-badge";
import { ExpenseStatusBadge } from "@/app/portal/(app)/finance/expenses/expense-badges";

describe("StatusBadge", () => {
  test("uses one geometry for every tone, so pills line up in a row", () => {
    const { container } = render(
      <>
        <StatusBadge tone="neutral">Submitted</StatusBadge>
        <StatusBadge tone="success">Paid</StatusBadge>
      </>,
    );
    const [first, second] = Array.from(
      container.querySelectorAll('[data-slot="badge"]'),
    );
    // Everything but the colour classes is shared, so the height and radius
    // that the private Pill copies each got wrong now come from one place.
    expect(first.className).toContain("h-5");
    expect(second.className).toContain("h-5");
    expect(first.className).toContain("rounded-4xl");
  });

  test("gives approved and paid different colours", () => {
    const { container: approved } = render(
      <ExpenseStatusBadge status="approved" />,
    );
    const { container: paid } = render(<ExpenseStatusBadge status="paid" />);

    // The two states a finance reviewer most needs to tell apart used to be
    // adjacent purples.
    expect(approved.firstElementChild?.className).toContain("bg-primary/10");
    expect(paid.firstElementChild?.className).toContain("bg-success/10");
  });
});

describe("humanizeStatus", () => {
  test("renders a multi-word enum as words, not Not_started", () => {
    expect(humanizeStatus("not_started")).toBe("Not started");
    expect(humanizeStatus("paid")).toBe("Paid");
  });

  test("is what the badges print when a module has no label map", () => {
    render(<ExpenseStatusBadge status="submitted" />);
    expect(screen.getByText("Submitted")).toBeInTheDocument();
  });
});
