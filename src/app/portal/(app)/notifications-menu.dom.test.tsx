import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import type { PendingApprovalItem } from "@/lib/portal/attention-items";
import { NotificationsMenu } from "./notifications-menu";

function item(
  overrides: Partial<PendingApprovalItem> = {},
): PendingApprovalItem {
  return {
    key: "contact_messages_new",
    label: "New messages",
    count: 3,
    href: "/portal/communications?status=new",
    severity: "info",
    ...overrides,
  };
}

describe("NotificationsMenu", () => {
  test("stays in the header at zero, and says so", () => {
    // The control used to return null, so it disappeared from the header
    // entirely -- it could answer "is something wrong?" but never "am I
    // clear?".
    render(<NotificationsMenu items={[]} />);
    expect(
      screen.getByRole("button", { name: "Nothing needs your attention" }),
    ).toBeInTheDocument();
  });

  test("counts every item in the trigger label", () => {
    render(
      <NotificationsMenu
        items={[item({ count: 3 }), item({ key: "b", count: 2 })]}
      />,
    );
    expect(
      screen.getByRole("button", { name: "5 items needing attention" }),
    ).toBeInTheDocument();
  });

  test("keeps red for the loudest thing present, not for every count", () => {
    const { container: infoOnly } = render(
      <NotificationsMenu items={[item({ severity: "info" })]} />,
    );
    expect(infoOnly.querySelector('[data-slot="badge"]')?.className).toContain(
      "bg-primary/10",
    );

    const { container: withUrgent } = render(
      <NotificationsMenu
        items={[
          item({ severity: "info" }),
          item({ key: "b", severity: "urgent" }),
        ]}
      />,
    );
    expect(
      withUrgent.querySelector('[data-slot="badge"]')?.className,
    ).toContain("bg-destructive");
  });

  test("an approval waiting is amber, not red", () => {
    const { container } = render(
      <NotificationsMenu items={[item({ severity: "attention" })]} />,
    );
    expect(container.querySelector('[data-slot="badge"]')?.className).toContain(
      "bg-warning/10",
    );
  });
});
